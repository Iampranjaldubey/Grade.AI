import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import DocumentType, ParseStatus


class PresignRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=512)
    content_type: str = Field(min_length=1, max_length=127)
    doc_type: DocumentType
    course_id: uuid.UUID
    assignment_id: Optional[uuid.UUID] = None


class PresignResponse(BaseModel):
    upload_url: str
    file_key: str
    expires_in: int


class ConfirmUploadRequest(BaseModel):
    file_key: str = Field(min_length=1, max_length=2048)
    file_name: str = Field(min_length=1, max_length=512)
    file_size_bytes: int = Field(gt=0)
    doc_type: DocumentType
    course_id: uuid.UUID
    assignment_id: Optional[uuid.UUID] = None


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    assignment_id: Optional[uuid.UUID]
    uploader_id: uuid.UUID
    doc_type: DocumentType
    file_name: str
    file_url: str
    mime_type: str
    file_size_bytes: int
    parse_status: ParseStatus
    created_at: datetime


class DocumentStatusOut(BaseModel):
    id: uuid.UUID
    file_name: str
    parse_status: ParseStatus
    chunk_count: int
