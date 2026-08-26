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
from app.infrastructure.chromadb_client import ChromaDBClient
from app.models.document_chunk import DocumentChunk
from app.tasks.grading import process_document

import structlog

logger = structlog.get_logger(__name__)

router = APIRouter()


async def _cleanup_previous_submission_artifacts(
    db: AsyncSession,
    settings: Settings,
    *,
    assignment_id: uuid.UUID,
    student_id: uuid.UUID,
    course_id: uuid.UUID,
    submission_id: uuid.UUID,
) -> None:
    """
    On resubmission, remove artifacts of the prior attempt so nothing leaks or
    goes stale:
      - old submission Document rows (+ their chunks via cascade) and their
        ChromaDB vectors (best-effort),
      - the existing Evaluation, so the new submission is graded from scratch
        rather than being blocked by a stale (possibly manual) grade.
    """
    old_docs = (
        await db.execute(
            select(Document).where(
                Document.assignment_id == assignment_id,
                Document.uploader_id == student_id,
                Document.doc_type == DocumentType.SUBMISSION,
            )
        )
    ).scalars().all()

    for od in old_docs:
        try:
            chroma = ChromaDBClient(settings)
            chroma.connect()
            chroma.delete_document_chunks(f"gradeai_{course_id}", str(od.id))
        except Exception as exc:
            logger.warning(
                "chromadb_cleanup_failed_on_resubmit",
                document_id=str(od.id),
                error=str(exc),
            )
        await db.delete(od)  # DocumentChunk rows cascade

    existing_eval = (
        await db.execute(
            select(Evaluation).where(Evaluation.submission_id == submission_id)
        )
    ).scalar_one_or_none()
    if existing_eval:
        await db.delete(existing_eval)

    await db.commit()


def _fresh_download_url(s3_service, file_key: str | None, fallback_url: str) -> str:
    """
    Generate a fresh, short-lived presigned download URL from the stored file_key.
    Presigning is a local operation (no S3 round trip). Falls back to the stored
    (possibly stale) URL for legacy rows that predate file_key persistence.
    """
    if not file_key:
        return fallback_url
    try:
        return s3_service.generate_presigned_download_url(file_key, expires=3600)
    except Exception:
        return fallback_url


def _get_mime_type(file_name: str) -> str:
    """Determine MIME type from file extension."""
    name = file_name.lower()
    if name.endswith(".pdf"):
        return "application/pdf"
    elif name.endswith(".docx"):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif name.endswith(".txt"):
        return "text/plain"
    return "application/octet-stream"


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

    # Check if assignment due date has passed. Normalize to UTC-aware so the
    # comparison never mixes naive/aware datetimes (some backends return naive).
    now = datetime.now(timezone.utc)
    due_date = assignment.due_date
    if due_date.tzinfo is None:
        due_date = due_date.replace(tzinfo=timezone.utc)
    if due_date < now:
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

    # Enforce size limit against the actual stored object to protect the worker
    # from OOM on oversized submissions. Remove the oversized object.
    actual_size = s3_service.get_file_size(payload.file_key)
    if actual_size is not None and actual_size > settings.max_upload_size_bytes:
        s3_service.delete_file(payload.file_key)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.max_upload_size_bytes} bytes",
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
        # Resubmission: clean up the previous attempt's document(s), chunks,
        # vectors, and evaluation before recording the new file, so nothing
        # orphans and the new work is re-graded from scratch.
        await _cleanup_previous_submission_artifacts(
            db,
            settings,
            assignment_id=payload.assignment_id,
            student_id=student.id,
            course_id=assignment.course_id,
            submission_id=existing_submission.id,
        )

        # Update existing submission
        existing_submission.file_url = file_url
        existing_submission.file_key = payload.file_key
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
            file_key=payload.file_key,
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
        file_key=payload.file_key,                   # fixed: was missing entirely
        mime_type=_get_mime_type(payload.file_name),  # fixed: was hardcoded to application/pdf
        file_size_bytes=payload.file_size_bytes,
        parse_status=ParseStatus.PENDING,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    # Trigger document processing. When processing succeeds, process_document
    # itself chains AI evaluation for auto/hybrid submissions (see grading.py) -
    # so evaluation never races ahead of parsing, and no fixed countdown is used.
    try:
        process_document.delay(str(document.id))
    except Exception as exc:
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
    settings: Settings = Depends(get_settings),
) -> SubmissionOut:
    """Get the student's own submission for an assignment."""

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

    # Regenerate a fresh download URL so historical submissions never return an
    # expired link (the stored file_url is a snapshot that expires after 24h).
    s3_service = get_s3_service(settings)
    fresh_url = _fresh_download_url(s3_service, submission.file_key, submission.file_url)
    return SubmissionOut.model_validate(submission).model_copy(update={"file_url": fresh_url})


@router.get(
    "/{assignment_id}/all",
    response_model=List[SubmissionWithStudent],
    summary="Get all submissions for an assignment",
)
async def get_all_submissions(
    assignment_id: uuid.UUID,
    professor: User = Depends(get_current_professor),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> List[SubmissionWithStudent]:
    """Get all submissions for an assignment (professor only)."""

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

    result = await db.execute(
        select(Submission, User, Evaluation)
        .join(User, Submission.student_id == User.id)
        .outerjoin(Evaluation, Evaluation.submission_id == Submission.id)
        .where(Submission.assignment_id == assignment_id)
        .order_by(Submission.submitted_at.desc())
    )

    rows = result.all()

    s3_service = get_s3_service(settings)
    submissions_with_students = []
    for submission, user, evaluation in rows:
        fresh_url = _fresh_download_url(s3_service, submission.file_key, submission.file_url)
        submissions_with_students.append(
            SubmissionWithStudent(
                id=submission.id,
                assignment_id=submission.assignment_id,
                student_id=submission.student_id,
                file_url=fresh_url,
                file_name=submission.file_name,
                submitted_at=submission.submitted_at,
                status=submission.status,
                student_name=user.name,
                student_email=user.email,
                has_evaluation=evaluation is not None,
            )
        )

    return submissions_with_students