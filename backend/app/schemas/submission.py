import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import SubmissionStatus


class SubmissionCreate(BaseModel):
    assignment_id: uuid.UUID
    file_name: str = Field(min_length=1, max_length=512)
    file_key: str = Field(min_length=1, max_length=2048)
    file_size_bytes: int = Field(gt=0)


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assignment_id: uuid.UUID
    student_id: uuid.UUID
    file_url: str
    file_name: str
    submitted_at: datetime
    status: SubmissionStatus


class SubmissionStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: SubmissionStatus
    submitted_at: datetime


class SubmissionWithStudent(SubmissionOut):
    student_name: str
    student_email: str
    has_evaluation: bool
