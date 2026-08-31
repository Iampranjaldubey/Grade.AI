"""
API endpoints for AI evaluation management.
Professor reviews AI-generated grades, approves or overrides them.
Students view their approved grades.
"""

import uuid
from datetime import datetime
from decimal import Decimal

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.deps import require_professor, require_student
from app.core.enums import ApprovalStatus, SubmissionStatus
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.evaluation import Evaluation
from app.models.submission import Submission
from app.models.user import User
from app.schemas.evaluation import (
    ApproveEvaluationRequest,
    EvaluationListOut,
    EvaluationOut,
    ManualEvaluationCreate,
    OverrideEvaluationRequest,
    StudentEvaluationOut,
)
from app.tasks.grading import (
    MANUAL_EVALUATION_EXISTS,
    PROFESSOR_APPROVAL_EXISTS,
    PROFESSOR_OVERRIDE_EXISTS,
    evaluate_submission,
    human_decision_reason,
)

logger = structlog.get_logger(__name__)
router = APIRouter()

# Professor-facing explanations for a refused re-grade.
TRIGGER_CONFLICT_DETAIL = {
    MANUAL_EVALUATION_EXISTS: (
        "This submission was graded manually. Re-running AI grading would discard "
        "that grade, so it was not started."
    ),
    PROFESSOR_OVERRIDE_EXISTS: (
        "You already overrode this grade. Re-running AI grading would discard your "
        "score and feedback, so it was not started."
    ),
    PROFESSOR_APPROVAL_EXISTS: (
        "This grade was already approved. Re-running AI grading would discard the "
        "approved result, so it was not started."
    ),
}


@router.get("/pending", response_model=list[EvaluationListOut])
async def list_pending_evaluations(
    course_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
) -> list[EvaluationListOut]:
    """
    List all pending AI evaluations for professor's courses.
    Sorted by confidence score (lowest first = needs most review).

    Professor only.
    """
    # Build query for evaluations in professor's courses
    query = (
        select(Evaluation)
        .join(Submission, Evaluation.submission_id == Submission.id)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .join(Course, Assignment.course_id == Course.id)
        .join(User, Submission.student_id == User.id)
        .where(Course.professor_id == current_user.id)
        .where(Evaluation.approval_status == ApprovalStatus.PENDING)
        .options(
            joinedload(Evaluation.submission).joinedload(Submission.student),
            joinedload(Evaluation.submission).joinedload(Submission.assignment),
        )
    )

    # Filter by course if specified
    if course_id:
        query = query.where(Course.id == course_id)

    result = await db.execute(query)
    evaluations = result.scalars().all()

    # Build response with student names and confidence scores
    output = []
    for evaluation in evaluations:
        confidence_score = 0.5
        is_fallback = False
        if evaluation.ai_feedback and isinstance(evaluation.ai_feedback, dict):
            confidence_score = evaluation.ai_feedback.get("confidence_score", 0.5)
            is_fallback = bool(evaluation.ai_feedback.get("is_fallback", False))

        output.append(
            EvaluationListOut(
                id=evaluation.id,
                submission_id=evaluation.submission_id,
                ai_score=evaluation.ai_score,
                approval_status=evaluation.approval_status,
                evaluated_at=evaluation.evaluated_at,
                confidence_score=confidence_score,
                is_fallback=is_fallback,
                student_name=evaluation.submission.student.name,
                student_email=evaluation.submission.student.email,
                assignment_title=evaluation.submission.assignment.title,
            )
        )

    # Sort by confidence score (lowest first = needs most attention)
    output.sort(key=lambda x: x.confidence_score)

    logger.info(
        "pending_evaluations_listed",
        professor_id=str(current_user.id),
        count=len(output),
        course_id=str(course_id) if course_id else None,
    )

    return output


@router.get("/{evaluation_id}", response_model=EvaluationOut)
async def get_evaluation_detail(
    evaluation_id: uuid.UUID,
    current_user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
) -> EvaluationOut:
    """
    Get full evaluation details including all criteria scores and retrieved chunks.

    Professor only.
    """
    # Load evaluation with submission and assignment
    query = (
        select(Evaluation)
        .where(Evaluation.id == evaluation_id)
        .options(
            joinedload(Evaluation.submission)
            .joinedload(Submission.assignment)
            .joinedload(Assignment.course)
        )
    )

    result = await db.execute(query)
    evaluation = result.scalar_one_or_none()

    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    # Verify professor owns the course
    course = evaluation.submission.assignment.course
    if course.professor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this evaluation")

    logger.info(
        "evaluation_detail_viewed",
        evaluation_id=str(evaluation_id),
        professor_id=str(current_user.id),
    )

    return EvaluationOut.model_validate(evaluation)


@router.post("/{evaluation_id}/approve", response_model=EvaluationOut)
async def approve_evaluation(
    evaluation_id: uuid.UUID,
    request: ApproveEvaluationRequest,
    current_user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
) -> EvaluationOut:
    """
    Approve an AI evaluation without changes.
    Sets final_score = ai_score and marks as approved.

    Professor only.
    """
    # Load evaluation
    query = (
        select(Evaluation)
        .where(Evaluation.id == evaluation_id)
        .options(
            joinedload(Evaluation.submission)
            .joinedload(Submission.assignment)
            .joinedload(Assignment.course)
        )
    )

    result = await db.execute(query)
    evaluation = result.scalar_one_or_none()

    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    # Verify professor owns the course
    course = evaluation.submission.assignment.course
    if course.professor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to approve this evaluation")

    # Check if already approved or overridden
    if evaluation.approval_status != ApprovalStatus.PENDING:
        raise HTTPException(
            status_code=400,
            detail=f"Evaluation already {evaluation.approval_status.value}",
        )

    # Cannot approve evaluation without AI score
    if evaluation.ai_score is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot approve evaluation without AI score. "
                "Use /override to set a manual score."
            ),
        )

    # Approve via an atomic compare-and-swap: the UPDATE only applies if the row
    # is still PENDING. This closes the race where two concurrent approve/override
    # calls both pass the pre-check above and the second silently clobbers the first.
    values = {
        "approval_status": ApprovalStatus.APPROVED,
        "final_score": evaluation.ai_score,
        "approved_by": current_user.id,
        "approved_at": datetime.utcnow(),
    }
    if request.professor_feedback:
        values["professor_feedback"] = request.professor_feedback

    update_result = await db.execute(
        update(Evaluation)
        .where(
            Evaluation.id == evaluation_id,
            Evaluation.approval_status == ApprovalStatus.PENDING,
        )
        .values(**values)
    )
    if update_result.rowcount == 0:
        raise HTTPException(
            status_code=409,
            detail="Evaluation was already approved or overridden by another action.",
        )

    # Update submission status
    evaluation.submission.status = SubmissionStatus.EVALUATED

    await db.commit()
    await db.refresh(evaluation)

    logger.info(
        "evaluation_approved",
        evaluation_id=str(evaluation_id),
        professor_id=str(current_user.id),
        final_score=float(evaluation.final_score) if evaluation.final_score is not None else None,
    )

    return EvaluationOut.model_validate(evaluation)


@router.post("/{evaluation_id}/override", response_model=EvaluationOut)
async def override_evaluation(
    evaluation_id: uuid.UUID,
    request: OverrideEvaluationRequest,
    current_user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
) -> EvaluationOut:
    """
    Override an AI evaluation with manual grading.
    Sets final_score to professor's score and marks as overridden.

    Professor only.
    """
    # Load evaluation
    query = (
        select(Evaluation)
        .where(Evaluation.id == evaluation_id)
        .options(
            joinedload(Evaluation.submission)
            .joinedload(Submission.assignment)
            .joinedload(Assignment.course)
        )
    )

    result = await db.execute(query)
    evaluation = result.scalar_one_or_none()

    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    # Verify professor owns the course
    course = evaluation.submission.assignment.course
    assignment = evaluation.submission.assignment

    if course.professor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to override this evaluation")

    # Validate final_score doesn't exceed max_score
    if request.final_score > assignment.max_score:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Final score ({request.final_score}) exceeds assignment "
                f"max score ({assignment.max_score})"
            ),
        )

    # Check if already approved or overridden
    if evaluation.approval_status != ApprovalStatus.PENDING:
        raise HTTPException(
            status_code=400,
            detail=f"Evaluation already {evaluation.approval_status.value}",
        )

    # Override via an atomic compare-and-swap: the UPDATE only applies if the row
    # is still PENDING, closing the concurrent approve/override clobber race.
    values = {
        "approval_status": ApprovalStatus.OVERRIDDEN,
        "final_score": Decimal(str(request.final_score)),
        "professor_feedback": request.professor_feedback,
        "approved_by": current_user.id,
        "approved_at": datetime.utcnow(),
    }
    # Optionally update criteria scores in ai_feedback (build the new value; the
    # atomic UPDATE replaces the whole JSON column).
    if request.criteria_overrides:
        new_feedback = dict(evaluation.ai_feedback or {})
        new_feedback["criteria_overrides"] = request.criteria_overrides
        values["ai_feedback"] = new_feedback

    update_result = await db.execute(
        update(Evaluation)
        .where(
            Evaluation.id == evaluation_id,
            Evaluation.approval_status == ApprovalStatus.PENDING,
        )
        .values(**values)
    )
    if update_result.rowcount == 0:
        raise HTTPException(
            status_code=409,
            detail="Evaluation was already approved or overridden by another action.",
        )

    # Update submission status
    evaluation.submission.status = SubmissionStatus.EVALUATED

    await db.commit()
    await db.refresh(evaluation)

    logger.info(
        "evaluation_overridden",
        evaluation_id=str(evaluation_id),
        professor_id=str(current_user.id),
        ai_score=float(evaluation.ai_score) if evaluation.ai_score is not None else None,
        final_score=float(evaluation.final_score) if evaluation.final_score is not None else None,
    )

    return EvaluationOut.model_validate(evaluation)


@router.post("/manual/{submission_id}", response_model=EvaluationOut)
async def create_manual_evaluation(
    submission_id: uuid.UUID,
    request: ManualEvaluationCreate,
    current_user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
) -> EvaluationOut:
    """
    Create a manual evaluation for a submission without AI grading.
    Used for manual-mode assignments or when professor wants to grade manually.

    Professor only.
    """
    # Load submission
    query = (
        select(Submission)
        .where(Submission.id == submission_id)
        .options(joinedload(Submission.assignment).joinedload(Assignment.course))
    )

    result = await db.execute(query)
    submission = result.scalar_one_or_none()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Verify professor owns the course
    course = submission.assignment.course
    assignment = submission.assignment

    if course.professor_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not authorized to grade this submission",
        )

    # Validate final_score doesn't exceed max_score
    if request.final_score > assignment.max_score:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Final score ({request.final_score}) exceeds assignment "
                f"max score ({assignment.max_score})"
            ),
        )

    # Check if evaluation already exists
    existing_eval_query = select(Evaluation).where(Evaluation.submission_id == submission_id)
    existing_eval_result = await db.execute(existing_eval_query)
    existing_eval = existing_eval_result.scalar_one_or_none()

    if existing_eval:
        raise HTTPException(
            status_code=409,
            detail=(
                "Evaluation already exists for this submission. "
                "Use /override endpoint to modify it."
            ),
        )

    # Create manual evaluation
    evaluation = Evaluation(
        submission_id=submission_id,
        ai_score=None,  # Manual evaluation - no AI score
        final_score=request.final_score,
        professor_feedback=request.professor_feedback,
        ai_feedback=(
            {"criteria_scores": request.criteria_scores} if request.criteria_scores else None
        ),
        # Manual grade is inherently "overridden" (not AI).
        approval_status=ApprovalStatus.OVERRIDDEN,
        approved_by=current_user.id,
        approved_at=datetime.utcnow(),
        evaluated_at=datetime.utcnow(),
        strengths=None,
        weaknesses=None,
        missing_topics=None,
        retrieved_chunks=None,
    )

    db.add(evaluation)

    # Update submission status
    submission.status = SubmissionStatus.EVALUATED

    await db.commit()
    await db.refresh(evaluation)

    logger.info(
        "manual_evaluation_created",
        evaluation_id=str(evaluation.id),
        submission_id=str(submission_id),
        professor_id=str(current_user.id),
        final_score=float(evaluation.final_score) if evaluation.final_score is not None else None,
    )

    return EvaluationOut.model_validate(evaluation)


@router.post("/trigger/{submission_id}")
async def trigger_evaluation(
    submission_id: uuid.UUID,
    current_user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Manually trigger AI evaluation for a submission.
    Useful for re-evaluating or evaluating submissions that failed.

    Professor only.
    """
    # Load submission
    query = (
        select(Submission)
        .where(Submission.id == submission_id)
        .options(joinedload(Submission.assignment).joinedload(Assignment.course))
    )

    result = await db.execute(query)
    submission = result.scalar_one_or_none()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Verify professor owns the course
    course = submission.assignment.course
    if course.professor_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to trigger evaluation for this submission"
        )

    # Refuse to re-grade a decision a human already made. Without this, the
    # queued task would load the existing evaluation and (in AUTO mode) replace
    # the professor's score and feedback with a fresh AI result.
    existing = await db.execute(select(Evaluation).where(Evaluation.submission_id == submission_id))
    existing_eval = existing.scalar_one_or_none()
    if existing_eval is not None:
        blocked_reason = human_decision_reason(existing_eval)
        if blocked_reason is not None:
            logger.info(
                "evaluation_trigger_rejected",
                submission_id=str(submission_id),
                professor_id=str(current_user.id),
                reason=blocked_reason,
            )
            raise HTTPException(
                status_code=409,
                detail=TRIGGER_CONFLICT_DETAIL[blocked_reason],
            )

    # Queue evaluation task
    task = evaluate_submission.delay(str(submission_id))

    logger.info(
        "evaluation_triggered",
        submission_id=str(submission_id),
        professor_id=str(current_user.id),
        task_id=task.id,
    )

    return {
        "message": "Evaluation queued",
        "submission_id": str(submission_id),
        "task_id": task.id,
    }


@router.get("/submission/{submission_id}", response_model=StudentEvaluationOut)
async def get_student_evaluation(
    submission_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudentEvaluationOut:
    """
    Student views their own grade.
    Only returns approved or overridden evaluations (not pending).

    Student only.
    """
    # Load evaluation for this submission
    query = (
        select(Evaluation)
        .join(Submission, Evaluation.submission_id == Submission.id)
        .where(Submission.id == submission_id)
        .where(Submission.student_id == current_user.id)
        .where(
            (Evaluation.approval_status == ApprovalStatus.APPROVED)
            | (Evaluation.approval_status == ApprovalStatus.OVERRIDDEN)
        )
    )

    result = await db.execute(query)
    evaluation = result.scalar_one_or_none()

    if not evaluation or evaluation.final_score is None:
        # final_score is always set by the time an evaluation reaches APPROVED
        # or OVERRIDDEN (see approve/override/manual endpoints), so this also
        # guards against any unexpected data inconsistency.
        raise HTTPException(
            status_code=404,
            detail="No approved evaluation found for this submission",
        )

    # Build student-facing response
    criteria_scores = []
    overall_feedback = "Your submission has been evaluated."
    percentage = 0.0

    if evaluation.ai_feedback and isinstance(evaluation.ai_feedback, dict):
        criteria_scores = evaluation.ai_feedback.get("criteria_scores", [])
        percentage = evaluation.ai_feedback.get("percentage", 0.0)

        # Build overall feedback from AI feedback or professor feedback
        if evaluation.professor_feedback:
            overall_feedback = evaluation.professor_feedback
        else:
            # Extract overall feedback from ai_feedback if available
            ai_overall = evaluation.ai_feedback.get("overall_feedback", "")
            if ai_overall:
                overall_feedback = ai_overall

    logger.info(
        "student_evaluation_viewed",
        evaluation_id=str(evaluation.id),
        student_id=str(current_user.id),
    )

    return StudentEvaluationOut(
        id=evaluation.id,
        submission_id=evaluation.submission_id,
        final_score=evaluation.final_score,
        percentage=percentage,
        strengths=evaluation.strengths,
        weaknesses=evaluation.weaknesses,
        missing_topics=evaluation.missing_topics,
        overall_feedback=overall_feedback,
        criteria_scores=criteria_scores,
        evaluated_at=evaluation.evaluated_at,
        approved_at=evaluation.approved_at,
    )
