import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.core.config import get_settings, Settings
from app.core.enums import DocumentType, ParseStatus
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.enrollment import Enrollment
from app.models.user import User
from app.schemas.document import (
    ConfirmUploadRequest,
    DocumentOut,
    DocumentStatusOut,
    PresignRequest,
    PresignResponse,
)
from app.services.s3_service import get_s3_service
from app.tasks.grading import process_document

router = APIRouter()

# Allowed MIME types
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}


async def _verify_course_access(
    course_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> Course:
    """Verify user has access to the course (professor owns it or student is enrolled)."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        )
    
    # Professor owns the course
    if course.professor_id == user.id:
        return course
    
    # Student is enrolled
    enrollment = await db.execute(
        select(Enrollment).where(
            Enrollment.course_id == course_id,
            Enrollment.student_id == user.id,
            Enrollment.status == "active",
        )
    )
    if enrollment.scalar_one_or_none():
        return course
    
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this course",
    )


@router.post(
    "/presign",
    response_model=PresignResponse,
    summary="Generate presigned upload URL",
)
async def presign_upload(
    payload: PresignRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> PresignResponse:
    """Generate a presigned URL for uploading a file to S3."""
    
    # Validate content type
    if payload.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Content type not allowed. Allowed types: {', '.join(ALLOWED_CONTENT_TYPES)}",
        )
    
    # Verify course access
    await _verify_course_access(payload.course_id, current_user, db)
    
    # If assignment_id provided, verify it belongs to the course
    if payload.assignment_id:
        assignment_result = await db.execute(
            select(Assignment).where(
                Assignment.id == payload.assignment_id,
                Assignment.course_id == payload.course_id,
            )
        )
        if not assignment_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assignment not found in this course",
            )
    
    # Generate file key
    file_uuid = uuid.uuid4()
    file_key = f"{payload.course_id}/{payload.doc_type.value}/{file_uuid}_{payload.file_name}"
    
    # Generate presigned URL
    s3_service = get_s3_service(settings)
    try:
        upload_url = s3_service.generate_presigned_upload_url(
            file_key=file_key,
            content_type=payload.content_type,
            expires=3600,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate presigned URL: {str(exc)}",
        )
    
    return PresignResponse(
        upload_url=upload_url,
        file_key=file_key,
        expires_in=3600,
    )


@router.post(
    "/confirm",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Confirm file upload and create document record",
)
async def confirm_upload(
    payload: ConfirmUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DocumentOut:
    """Confirm that a file was uploaded and create a document record."""
    
    # Verify course access
    await _verify_course_access(payload.course_id, current_user, db)
    
    # Verify file exists in S3
    s3_service = get_s3_service(settings)
    if not s3_service.file_exists(payload.file_key):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found in storage. Please upload the file first.",
        )
    
    # Determine MIME type from file name
    mime_type = "application/octet-stream"
    if payload.file_name.lower().endswith(".pdf"):
        mime_type = "application/pdf"
    elif payload.file_name.lower().endswith(".docx"):
        mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif payload.file_name.lower().endswith(".txt"):
        mime_type = "text/plain"
    
    # Generate download URL for file_url field
    file_url = s3_service.generate_presigned_download_url(payload.file_key, expires=86400)
    
    # Create document record
    document = Document(
        course_id=payload.course_id,
        assignment_id=payload.assignment_id,
        uploader_id=current_user.id,
        doc_type=payload.doc_type,
        file_name=payload.file_name,
        file_url=file_url,
        mime_type=mime_type,
        file_size_bytes=payload.file_size_bytes,
        parse_status=ParseStatus.PENDING,
    )
    
    db.add(document)
    await db.commit()
    await db.refresh(document)
    
    # Trigger document processing task
    try:
        process_document.delay(str(document.id))
    except Exception as exc:
        # Log but don't fail the request if task queue is down
        import structlog
        logger = structlog.get_logger(__name__)
        logger.error("failed_to_queue_document_processing", document_id=str(document.id), error=str(exc))
    
    return DocumentOut.model_validate(document)


@router.get(
    "/{document_id}/status",
    response_model=DocumentStatusOut,
    summary="Get document processing status",
)
async def get_document_status(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentStatusOut:
    """Get the current processing status of a document."""
    
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    
    # Verify access
    await _verify_course_access(document.course_id, current_user, db)
    
    # Count chunks
    chunk_count_result = await db.execute(
        select(func.count()).where(DocumentChunk.document_id == document_id)
    )
    chunk_count = chunk_count_result.scalar_one()
    
    return DocumentStatusOut(
        id=document.id,
        file_name=document.file_name,
        parse_status=document.parse_status,
        chunk_count=chunk_count,
    )


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document",
)
async def delete_document(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    """Delete a document (professor only)."""
    
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    
    # Verify professor owns the course
    course_result = await db.execute(
        select(Course).where(
            Course.id == document.course_id,
            Course.professor_id == current_user.id,
        )
    )
    if not course_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the course professor can delete documents",
        )
    
    # Extract file key from file_url
    file_key = document.file_url.split("?")[0].split("/")[-1]
    # Reconstruct full key path
    file_key = f"{document.course_id}/{document.doc_type.value}/{file_key}"
    
    # Delete from S3
    s3_service = get_s3_service(settings)
    s3_service.delete_file(file_key)
    
    # Delete chunks (cascade should handle this, but explicit is safer)
    await db.execute(
        select(DocumentChunk).where(DocumentChunk.document_id == document_id)
    )
    
    # Delete document record
    await db.delete(document)
    await db.commit()


@router.get(
    "/courses/{course_id}/documents",
    response_model=List[DocumentOut],
    summary="List documents for a course",
)
async def list_course_documents(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[DocumentOut]:
    """List all documents for a course (professor or enrolled student)."""
    
    # Verify course access
    await _verify_course_access(course_id, current_user, db)
    
    # Fetch documents
    result = await db.execute(
        select(Document)
        .where(Document.course_id == course_id)
        .order_by(Document.doc_type, Document.created_at.desc())
    )
    documents = result.scalars().all()
    
    return [DocumentOut.model_validate(doc) for doc in documents]
