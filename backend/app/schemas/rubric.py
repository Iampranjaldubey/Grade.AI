import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.assignment import AssignmentWithRubrics  # noqa: F401 — re-export for forward ref


class RubricCreate(BaseModel):
    criteria_name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    max_points: Decimal = Field(gt=0)
    weight: Decimal = Field(ge=0, le=100)
    evaluation_hints: str | None = None


class RubricUpdate(BaseModel):
    criteria_name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    max_points: Decimal | None = Field(default=None, gt=0)
    weight: Decimal | None = Field(default=None, ge=0, le=100)
    evaluation_hints: str | None = None


class RubricOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assignment_id: uuid.UUID
    criteria_name: str
    description: str | None
    max_points: Decimal
    weight: Decimal
    evaluation_hints: str | None
    created_at: datetime


class RubricListCreate(BaseModel):
    criteria: list[RubricCreate]

    @model_validator(mode="after")
    def validate_weights_sum(self) -> "RubricListCreate":
        total = sum(c.weight for c in self.criteria)
        # Allow a tiny floating-point tolerance
        if abs(total - Decimal("100")) > Decimal("0.01"):
            raise ValueError(f"Rubric weights must sum to exactly 100 (got {total})")
        return self


# Resolve the forward reference in AssignmentWithRubrics
AssignmentWithRubrics.model_rebuild()
