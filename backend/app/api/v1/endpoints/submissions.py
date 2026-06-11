import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_student, get_current_professor, get_db
from app.core.config import get_settings, Settings
from app.core.enums import DocumentType, ParseStatus, SubmissionStatus, EnrollmentStatus
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.document import Document
from app.models.enrollment import Enrollment
from app.models.evaluation import Evaluation
from app.models.submission import Submission
from app.models.user import User
from app.schemas.submission import (
    SubmissionCreate,
    SubmissionOut,
    SubmissionWithStudent,
)
from app.services.s3_service import get_s3_service
from app.tasks.grading import process_document

router = APIRouter()


@router.post(
    "",
    response_model=SubmissionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an assignment",
)
async def create_submission(
    payload: SubmissionCreate,
    student: User = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SubmissionOut:
    """Submit an assignment (student only)."""
    
    # Fetch assignment with course
    assignment_result = await db.execute(
        select(Assignment)
        .options(selectinload(Assignment.course))
        .where(Assignment.id == payload.assignment_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )
    
    # Verify student is enrolled in the course
    enrollment_result = await db.execute(
        select(Enrollment).where(
            Enrollment.course_id == assignment.course_id,
            Enrollment.student_id == student.id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
        )
    )
    if not enrollment_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not enrolled in this course",
        )
    
    # Check if assignment due date has passed
    now = datetime.now(timezone.utc)
    if assignment.due_date < now:
        # Allow submission but mark as late
        submission_status = SubmissionStatus.LATE
    else:
        submission_status = SubmissionStatus.SUBMITTED
    
    # Verify file exists in S3
    s3_service = get_s3_service(settings)
    if not s3_service.file_exists(payload.file_key):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found in storage. Please upload the file first.",
        )
    
    # Generate download URL
    file_url = s3_service.generate_presigned_download_url(payload.file_key, expires=86400)
    
    # Check if existing submission exists
    existing_result = await db.execute(
        select(Submission).where(
            Submission.assignment_id == payload.assignment_id,
            Submission.student_id == student.id,
        )
    )
    existing_submission = existing_result.scalar_one_or_none()
    
    if existing_submission:
        # Update existing submission
        existing_submission.file_url = file_url
        existing_submission.file_name = payload.file_name
        existing_submission.submitted_at = datetime.now(timezone.utc)
        existing_submission.status = submission_status
        await db.commit()
        await db.refresh(existing_submission)
        submission = existing_submission
    else:
        # Create new submission
        submission = Submission(
            assignment_id=payload.assignment_id,
            student_id=student.id,
            file_url=file_url,
            file_name=payload.file_name,
            status=submission_status,
        )
        db.add(submission)
        await db.commit()
        await db.refresh(submission)
    
    # Create Document record for the submission
    document = Document(
        course_id=assignment.course_id,
        assignment_id=assignment.id,
        uploader_id=student.id,
        doc_type=DocumentType.SUBMISSION,
        file_name=payload.file_name,
        file_url=file_url,
        mime_type="application/pdf",  # Assume PDF for now
        file_size_bytes=payload.file_size_bytes,
        parse_status=ParseStatus.PENDING,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    
    # Trigger document processing
    try:
        process_document.delay(str(document.id))
    except Exception as exc:
        import structlog
        logger = structlog.get_logger(__name__)
        logger.error(
            "failed_to_queue_document_processing",
            document_id=str(document.id),
            error=str(exc),
        )
    
    return SubmissionOut.model_validate(submission)


@router.get(
    "/{assignment_id}/my-submission",
    response_model=SubmissionOut,
    summary="Get my submission for an assignment",
)
async def get_my_submission(
    assignment_id: uuid.UUID,
    student: User = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> SubmissionOut:
    """Get the student's own submission for an assignment."""
    
    # Verify assignment exists and student is enrolled
    assignment_result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )
    
    # Verify student is enrolled
    enrollment_result = await db.execute(
        select(Enrollment).where(
            Enrollment.course_id == assignment.course_id,
            Enrollment.student_id == student.id,
            Enrollment.status == EnrollmentStatus.ACTIVE,
        )
    )
    if not enrollment_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not enrolled in this course",
        )
    
    # Fetch submission
    submission_result = await db.execute(
        select(Submission).where(
            Submission.assignment_id == assignment_id,
            Submission.student_id == student.id,
        )
    )
    submission = submission_result.scalar_one_or_none()
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No submission found for this assignment",
        )
    
    return SubmissionOut.model_validate(submission)


@router.get(
    "/{assignment_id}/all",
    response_model=List[SubmissionWithStudent],
    summary="Get all submissions for an assignment",
)
async def get_all_submissions(
    assignment_id: uuid.UUID,
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
) -> List[SubmissionWithStudent]:
    """Get all submissions for an assignment (professor only)."""
    
    # Fetch assignment and verify professor owns the course
    assignment_result = await db.execute(
        select(Assignment)
        .join(Course, Assignment.course_id == Course.id)
        .where(
            Assignment.id == assignment_id,
            Course.professor_id == professor.id,
        )
    )
    assignment = assignment_result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found or you do not own the course",
        )
    
    # Fetch all submissions with student info
    result = await db.execute(
        select(Submission, User, Evaluation)
        .join(User, Submission.student_id == User.id)
        .outerjoin(Evaluation, Evaluation.submission_id == Submission.id)
        .where(Submission.assignment_id == assignment_id)
        .order_by(Submission.submitted_at.desc())
    )
    
    rows = result.all()
    
    submissions_with_students = []
    for submission, user, evaluation in rows:
        submissions_with_students.append(
            SubmissionWithStudent(
                id=submission.id,
                assignment_id=submission.assignment_id,
                student_id=submission.student_id,
                file_url=submission.file_url,
                file_name=submission.file_name,
                submitted_at=submission.submitted_at,
                status=submission.status,
                student_name=user.name,
                student_email=user.email,
                has_evaluation=evaluation is not None,
            )
        )
    
    return submissions_with_students
