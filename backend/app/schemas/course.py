import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CourseCreate(BaseModel):
    course_name: str = Field(min_length=1, max_length=255)
    course_code: str = Field(min_length=1, max_length=64)
    semester: str = Field(min_length=1, max_length=64)
    description: Optional[str] = None


class CourseUpdate(BaseModel):
    course_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    course_code: Optional[str] = Field(default=None, min_length=1, max_length=64)
    semester: Optional[str] = Field(default=None, min_length=1, max_length=64)
    description: Optional[str] = None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_name: str
    course_code: str
    professor_id: uuid.UUID
    semester: str
    join_code: str | None = None    # ADD THIS LINE
    description: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CourseListOut(CourseOut):
    student_count: int = 0
    assignment_count: int = 0
