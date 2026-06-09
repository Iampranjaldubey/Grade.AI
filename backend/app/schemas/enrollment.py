import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.core.enums import EnrollmentStatus
from app.schemas.course import CourseOut


class JoinCourseRequest(BaseModel):
    join_code: str


class EnrollmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    student_id: uuid.UUID
    enrolled_at: datetime
    status: EnrollmentStatus
    course: CourseOut
