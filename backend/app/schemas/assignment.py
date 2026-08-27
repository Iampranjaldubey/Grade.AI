import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import GradingMode

if TYPE_CHECKING:
    from app.schemas.rubric import RubricOut


class AssignmentCreate(BaseModel):
    course_id: uuid.UUID
    title: str = Field(min_length=1, max_length=512)
    description: str | None = None
    due_date: datetime
    max_score: Decimal = Field(gt=0)
    grading_mode: GradingMode


class AssignmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    description: str | None = None
    due_date: datetime | None = None
    max_score: Decimal | None = Field(default=None, gt=0)
    grading_mode: GradingMode | None = None


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    description: str | None
    due_date: datetime
    max_score: Decimal
    grading_mode: GradingMode
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AssignmentListOut(AssignmentOut):
    submission_count: int = 0


class AssignmentWithRubrics(AssignmentOut):
    rubrics: list["RubricOut"] = []
