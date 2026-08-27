"""
Schemas for professor analytics endpoints.
"""

from pydantic import BaseModel


class AnalyticsOverviewOut(BaseModel):
    """Aggregated grading analytics across a professor's courses."""

    total_courses: int
    total_students: int
    total_assignments: int
    total_submissions: int
    submissions_graded: int
    pending_evaluations: int
    # Mean percentage (0-100) across graded evaluations; 0 when none graded yet.
    average_score: float
