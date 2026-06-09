import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import GradingMode

if TYPE_CHECKING:
    from app.schemas.rubric import RubricOut


class AssignmentCreate(BaseModel):
    course_id: uuid.UUID
    title: str = Field(min_length=1, max_length=512)
    description: Optional[str] = None
    due_date: datetime
    max_score: Decimal = Field(gt=0)
    grading_mode: GradingMode


class AssignmentUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=512)
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    max_score: Optional[Decimal] = Field(default=None, gt=0)
    grading_mode: Optional[GradingMode] = None


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    description: Optional[str]
    due_date: datetime
    max_score: Decimal
    grading_mode: GradingMode
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AssignmentListOut(AssignmentOut):
    submission_count: int = 0


class AssignmentWithRubrics(AssignmentOut):
    rubrics: List["RubricOut"] = []
