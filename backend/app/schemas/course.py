import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CourseCreate(BaseModel):
    course_name: str = Field(min_length=1, max_length=255)
    course_code: str = Field(min_length=1, max_length=64)
    semester: str = Field(min_length=1, max_length=64)
    description: str | None = None


class CourseUpdate(BaseModel):
    course_name: str | None = Field(default=None, min_length=1, max_length=255)
    course_code: str | None = Field(default=None, min_length=1, max_length=64)
    semester: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_name: str
    course_code: str
    professor_id: uuid.UUID
    semester: str
    join_code: str | None = None  # ADD THIS LINE
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CourseListOut(CourseOut):
    student_count: int = 0
    assignment_count: int = 0
