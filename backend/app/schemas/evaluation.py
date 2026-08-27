"""
Schemas for evaluation API endpoints.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.enums import ApprovalStatus


class CriteriaScoreOut(BaseModel):
    """Individual criterion score breakdown."""

    criterion_name: str
    awarded: float
    max: float
    reasoning: str


class EvaluationOut(BaseModel):
    """Complete evaluation response."""

    id: UUID
    submission_id: UUID
    ai_score: Decimal | None = None
    final_score: Decimal | None = None
    ai_feedback: dict[str, Any] | None = None
    professor_feedback: str | None = None
    strengths: list[str] | None = None
    weaknesses: list[str] | None = None
    missing_topics: list[str] | None = None
    approval_status: ApprovalStatus
    evaluated_at: datetime
    approved_at: datetime | None = None

    @property
    def confidence_score(self) -> float:
        """Extract confidence score from ai_feedback."""
        if self.ai_feedback and isinstance(self.ai_feedback, dict):
            return self.ai_feedback.get("confidence_score", 0.5)
        return 0.5

    @property
    def criteria_scores(self) -> list[dict]:
        """Extract criteria scores from ai_feedback."""
        if self.ai_feedback and isinstance(self.ai_feedback, dict):
            return self.ai_feedback.get("criteria_scores", [])
        return []

    @property
    def percentage(self) -> float:
        """Extract percentage from ai_feedback."""
        if self.ai_feedback and isinstance(self.ai_feedback, dict):
            return self.ai_feedback.get("percentage", 0.0)
        return 0.0

    @property
    def is_fallback(self) -> bool:
        """True if this is a placeholder produced when AI grading failed entirely."""
        if self.ai_feedback and isinstance(self.ai_feedback, dict):
            return bool(self.ai_feedback.get("is_fallback", False))
        return False

    model_config = {"from_attributes": True}


class EvaluationListOut(BaseModel):
    """Evaluation list item for professor's pending reviews."""

    id: UUID
    submission_id: UUID
    ai_score: Decimal | None = None
    approval_status: ApprovalStatus
    evaluated_at: datetime
    confidence_score: float
    is_fallback: bool = False
    student_name: str
    student_email: str
    assignment_title: str

    model_config = {"from_attributes": True}


class ApproveEvaluationRequest(BaseModel):
    """Request to approve an AI evaluation."""

    professor_feedback: str | None = Field(
        default=None,
        description="Optional feedback from professor",
    )


class OverrideEvaluationRequest(BaseModel):
    """Request to override an AI evaluation with manual grading."""

    final_score: float = Field(
        ...,
        ge=0,
        description="Final score determined by professor",
    )
    professor_feedback: str = Field(
        ...,
        min_length=1,
        description="Required feedback explaining the override",
    )
    criteria_overrides: list[dict[str, Any]] | None = Field(
        default=None,
        description="Optional per-criterion score adjustments",
    )


class ManualEvaluationCreate(BaseModel):
    """Request to create a manual evaluation (no AI)."""

    final_score: Decimal = Field(
        ...,
        gt=0,
        description="Final score determined by professor",
    )
    professor_feedback: str = Field(
        ...,
        min_length=1,
        description="Required feedback for manual grading",
    )
    criteria_scores: list[dict[str, Any]] | None = Field(
        default=None,
        description="Optional per-criterion score breakdown",
    )


class StudentEvaluationOut(BaseModel):
    """Evaluation view for students (limited fields)."""

    id: UUID
    submission_id: UUID
    final_score: Decimal
    percentage: float
    strengths: list[str] | None = None
    weaknesses: list[str] | None = None
    missing_topics: list[str] | None = None
    overall_feedback: str
    criteria_scores: list[dict[str, Any]]
    evaluated_at: datetime
    approved_at: datetime | None = None

    model_config = {"from_attributes": True}
