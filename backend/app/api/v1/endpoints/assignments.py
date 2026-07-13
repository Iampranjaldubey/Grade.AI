import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, get_current_professor
from app.core.enums import ApprovalStatus, EnrollmentStatus
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.evaluation import Evaluation
from app.models.rubric import Rubric
from app.models.submission import Submission
from app.models.user import User
from app.schemas.assignment import (
    AssignmentCreate,
    AssignmentListOut,
    AssignmentOut,
    AssignmentUpdate,
    AssignmentWithRubrics,
)
from app.schemas.rubric import RubricListCreate, RubricOut, RubricUpdate

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_professor_course(
    course_id: uuid.UUID, professor: User, db: AsyncSession
) -> Course:
    result = await db.execute(
        select(Course).where(Course.id == course_id, Course.professor_id == professor.id)
    )
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Course not found or you do not own it",
        )
    return course


async def _get_assignment_with_ownership(
    assignment_id: uuid.UUID, professor: User, db: AsyncSession
) -> Assignment:
    result = await db.execute(
        select(Assignment)
        .join(Course, Assignment.course_id == Course.id)
        .where(Assignment.id == assignment_id, Course.professor_id == professor.id)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found or you do not own it",
        )
    return assignment


async def _has_evaluated_submissions(assignment_id: uuid.UUID, db: AsyncSession) -> bool:
    """Return True if there are any evaluated (approved/overridden) submissions."""
    result = await db.execute(
        select(func.count())
        .select_from(Submission)
        .join(Evaluation, Evaluation.submission_id == Submission.id)
        .where(
            Submission.assignment_id == assignment_id,
            Evaluation.approval_status.in_(
                [ApprovalStatus.APPROVED, ApprovalStatus.OVERRIDDEN]
            ),
        )
    )
    return result.scalar_one() > 0


async def _assignment_with_submission_count(
    db: AsyncSession, assignment: Assignment
) -> AssignmentListOut:
    count_result = await db.execute(
        select(func.count()).where(Submission.assignment_id == assignment.id)
    )
    return AssignmentListOut(
        **AssignmentOut.model_validate(assignment).model_dump(),
        submission_count=count_result.scalar_one(),
    )


# ---------------------------------------------------------------------------
# Assignment routes
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=AssignmentListOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an assignment",
)
async def create_assignment(
    payload: AssignmentCreate,
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
) -> AssignmentListOut:
    await _get_professor_course(payload.course_id, professor, db)

    # Validate due_date is in the future
    due_date = payload.due_date
    if due_date.tzinfo is None:
        due_date = due_date.replace(tzinfo=timezone.utc)
    if due_date <= datetime.now(tz=timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="due_date must be in the future",
        )

    assignment = Assignment(
        course_id=payload.course_id,
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        max_score=payload.max_score,
        grading_mode=payload.grading_mode,
        is_active=True,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return await _assignment_with_submission_count(db, assignment)


@router.get(
    "",
    response_model=List[AssignmentListOut],
    summary="List assignments for a course",
)
async def list_assignments(
    course_id: uuid.UUID = Query(...),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[AssignmentListOut]:
    from app.core.enums import UserRole  # avoid circular at module level

    # Verify the course exists and the user has access to it
    course_result = await db.execute(select(Course).where(Course.id == course_id))
    course = course_result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    if current_user.role == UserRole.PROFESSOR:
        if course.professor_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not own this course",
            )
    else:
        enrollment_check = await db.execute(
            select(Enrollment).where(
                Enrollment.course_id == course_id,
                Enrollment.student_id == current_user.id,
                Enrollment.status == EnrollmentStatus.ACTIVE,
            )
        )
        if enrollment_check.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not enrolled in this course",
            )

    offset = (page - 1) * size
    result = await db.execute(
        select(Assignment)
        .where(Assignment.course_id == course_id, Assignment.is_active.is_(True))
        .order_by(Assignment.due_date.asc())
        .offset(offset)
        .limit(size)
    )
    assignments = result.scalars().all()
    return [await _assignment_with_submission_count(db, a) for a in assignments]

@router.get(
    "/{assignment_id}",
    response_model=AssignmentWithRubrics,
    summary="Get a single assignment with rubrics",
)
async def get_assignment(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentWithRubrics:
    from app.core.enums import UserRole  # avoid circular at module level

    result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id, Assignment.is_active.is_(True))
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    if current_user.role == UserRole.PROFESSOR:
        # Professor must own the course
        course_check = await db.execute(
            select(Course).where(
                Course.id == assignment.course_id,
                Course.professor_id == current_user.id,
            )
        )
        if course_check.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not own this course",
            )
    else:
        # Student must be enrolled
        enrollment_check = await db.execute(
            select(Enrollment).where(
                Enrollment.course_id == assignment.course_id,
                Enrollment.student_id == current_user.id,
                Enrollment.status == EnrollmentStatus.ACTIVE,
            )
        )
        if enrollment_check.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not enrolled in this course",
            )

    # Fetch rubrics
    rubric_result = await db.execute(
        select(Rubric).where(Rubric.assignment_id == assignment.id).order_by(Rubric.created_at)
    )
    rubrics = rubric_result.scalars().all()

    base = AssignmentOut.model_validate(assignment)
    return AssignmentWithRubrics(
        **base.model_dump(),
        rubrics=[RubricOut.model_validate(r) for r in rubrics],
    )


@router.put(
    "/{assignment_id}",
    response_model=AssignmentOut,
    summary="Update an assignment",
)
async def update_assignment(
    assignment_id: uuid.UUID,
    payload: AssignmentUpdate,
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
) -> AssignmentOut:
    assignment = await _get_assignment_with_ownership(assignment_id, professor, db)

    if await _has_evaluated_submissions(assignment_id, db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update an assignment that has evaluated submissions",
        )

    updates = payload.model_dump(exclude_unset=True)
    if "due_date" in updates and updates["due_date"] <= datetime.now(tz=timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="due_date must be in the future",
        )

    for field, value in updates.items():
        setattr(assignment, field, value)

    await db.commit()
    await db.refresh(assignment)
    return AssignmentOut.model_validate(assignment)


@router.delete(
    "/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete an assignment",
)
async def delete_assignment(
    assignment_id: uuid.UUID,
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
) -> None:
    assignment = await _get_assignment_with_ownership(assignment_id, professor, db)

    if await _has_evaluated_submissions(assignment_id, db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete an assignment that has evaluated submissions",
        )

    assignment.is_active = False
    await db.commit()


# ---------------------------------------------------------------------------
# Rubric routes — mounted at /rubrics via a separate router prefix
# ---------------------------------------------------------------------------

rubrics_router = APIRouter()


@router.post(
    "/{assignment_id}/rubrics",
    response_model=List[RubricOut],
    status_code=status.HTTP_201_CREATED,
    summary="Replace all rubrics for an assignment",
)
async def create_rubrics(
    assignment_id: uuid.UUID,
    payload: RubricListCreate,
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
) -> List[RubricOut]:
    assignment = await _get_assignment_with_ownership(assignment_id, professor, db)

    # Delete existing rubrics
    existing = await db.execute(
        select(Rubric).where(Rubric.assignment_id == assignment.id)
    )
    for rubric in existing.scalars().all():
        await db.delete(rubric)

    # Bulk insert
    new_rubrics = [
        Rubric(
            assignment_id=assignment.id,
            criteria_name=c.criteria_name,
            description=c.description,
            max_points=c.max_points,
            weight=c.weight,
            evaluation_hints=c.evaluation_hints,
        )
        for c in payload.criteria
    ]
    db.add_all(new_rubrics)
    await db.commit()

    result = await db.execute(
        select(Rubric).where(Rubric.assignment_id == assignment.id).order_by(Rubric.created_at)
    )
    return [RubricOut.model_validate(r) for r in result.scalars().all()]


@router.get(
    "/{assignment_id}/rubrics",
    response_model=List[RubricOut],
    summary="List rubrics for an assignment",
)
async def list_rubrics(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[RubricOut]:
    from app.core.enums import UserRole  # avoid circular at module level

    result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id, Assignment.is_active.is_(True))
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    if current_user.role == UserRole.PROFESSOR:
        course_check = await db.execute(
            select(Course).where(
                Course.id == assignment.course_id,
                Course.professor_id == current_user.id,
            )
        )
        if course_check.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not own this course",
            )
    else:
        enrollment_check = await db.execute(
            select(Enrollment).where(
                Enrollment.course_id == assignment.course_id,
                Enrollment.student_id == current_user.id,
                Enrollment.status == EnrollmentStatus.ACTIVE,
            )
        )
        if enrollment_check.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not enrolled in this course",
            )

    rubric_result = await db.execute(
        select(Rubric).where(Rubric.assignment_id == assignment.id).order_by(Rubric.created_at)
    )
    return [RubricOut.model_validate(r) for r in rubric_result.scalars().all()]


@rubrics_router.put(
    "/{rubric_id}",
    response_model=RubricOut,
    summary="Update a single rubric criterion",
)
async def update_rubric(
    rubric_id: uuid.UUID,
    payload: RubricUpdate,
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
) -> RubricOut:
    # Verify the rubric exists and the professor owns the assignment's course
    result = await db.execute(
        select(Rubric)
        .join(Assignment, Rubric.assignment_id == Assignment.id)
        .join(Course, Assignment.course_id == Course.id)
        .where(Rubric.id == rubric_id, Course.professor_id == professor.id)
    )
    rubric = result.scalar_one_or_none()
    if rubric is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rubric not found or you do not own it",
        )

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(rubric, field, value)

    # Re-validate that all rubrics for this assignment still sum to 100
    await db.flush()  # so the updated weight is reflected in the query
    sibling_result = await db.execute(
        select(Rubric).where(Rubric.assignment_id == rubric.assignment_id)
    )
    siblings = sibling_result.scalars().all()
    from decimal import Decimal

    total = sum(r.weight for r in siblings)
    if abs(total - Decimal("100")) > Decimal("0.01"):
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"After this update, rubric weights would sum to {total}, not 100",
        )

    await db.commit()
    await db.refresh(rubric)
    return RubricOut.model_validate(rubric)


@rubrics_router.delete(
    "/{rubric_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a rubric criterion",
)
async def delete_rubric(
    rubric_id: uuid.UUID,
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(Rubric)
        .join(Assignment, Rubric.assignment_id == Assignment.id)
        .join(Course, Assignment.course_id == Course.id)
        .where(Rubric.id == rubric_id, Course.professor_id == professor.id)
    )
    rubric = result.scalar_one_or_none()
    if rubric is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rubric not found or you do not own it",
        )
    await db.delete(rubric)
    await db.commit()
