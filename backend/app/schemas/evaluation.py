"""
Schemas for evaluation API endpoints.
"""
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
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
    ai_score: Decimal
    final_score: Optional[Decimal] = None
    ai_feedback: Optional[dict[str, Any]] = None
    professor_feedback: Optional[str] = None
    strengths: Optional[list[str]] = None
    weaknesses: Optional[list[str]] = None
    missing_topics: Optional[list[str]] = None
    approval_status: ApprovalStatus
    evaluated_at: datetime
    approved_at: Optional[datetime] = None
    
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

    model_config = {"from_attributes": True}


class EvaluationListOut(BaseModel):
    """Evaluation list item for professor's pending reviews."""
    id: UUID
    submission_id: UUID
    ai_score: Decimal
    approval_status: ApprovalStatus
    evaluated_at: datetime
    confidence_score: float
    student_name: str
    student_email: str
    assignment_title: str
    
    model_config = {"from_attributes": True}


class ApproveEvaluationRequest(BaseModel):
    """Request to approve an AI evaluation."""
    professor_feedback: Optional[str] = Field(
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
    criteria_overrides: Optional[list[dict[str, Any]]] = Field(
        default=None,
        description="Optional per-criterion score adjustments",
    )


class StudentEvaluationOut(BaseModel):
    """Evaluation view for students (limited fields)."""
    id: UUID
    submission_id: UUID
    final_score: Decimal
    percentage: float
    strengths: Optional[list[str]] = None
    weaknesses: Optional[list[str]] = None
    missing_topics: Optional[list[str]] = None
    overall_feedback: str
    criteria_scores: list[dict[str, Any]]
    evaluated_at: datetime
    approved_at: Optional[datetime] = None
    
    model_config = {"from_attributes": True}
