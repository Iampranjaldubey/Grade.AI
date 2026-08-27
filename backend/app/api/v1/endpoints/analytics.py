"""
Professor analytics endpoints.

Aggregates grading activity across every course a professor owns so the
dashboard can show real figures instead of placeholders.
"""

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_professor
from app.core.enums import ApprovalStatus, EnrollmentStatus
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.evaluation import Evaluation
from app.models.submission import Submission
from app.models.user import User
from app.schemas.analytics import AnalyticsOverviewOut

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.get(
    "",
    response_model=AnalyticsOverviewOut,
    summary="Analytics overview",
    description="Aggregated grading analytics for professor dashboards.",
)
async def analytics_overview(
    professor: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsOverviewOut:
    # All course ids owned by this professor. Reused by the other aggregates.
    course_ids_subq = select(Course.id).where(Course.professor_id == professor.id).scalar_subquery()

    total_courses = await db.scalar(
        select(func.count(Course.id)).where(Course.professor_id == professor.id)
    )

    total_students = await db.scalar(
        select(func.count(func.distinct(Enrollment.student_id))).where(
            Enrollment.course_id.in_(course_ids_subq),
            Enrollment.status == EnrollmentStatus.ACTIVE,
        )
    )

    total_assignments = await db.scalar(
        select(func.count(Assignment.id)).where(Assignment.course_id.in_(course_ids_subq))
    )

    total_submissions = await db.scalar(
        select(func.count(Submission.id))
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .where(Assignment.course_id.in_(course_ids_subq))
    )

    graded_statuses = (ApprovalStatus.APPROVED, ApprovalStatus.OVERRIDDEN)

    # Count pending vs graded evaluations in a single scan over the professor's
    # evaluations using conditional aggregation.
    eval_counts = (
        select(
            func.count(case((Evaluation.approval_status == ApprovalStatus.PENDING, 1))).label(
                "pending"
            ),
            func.count(case((Evaluation.approval_status.in_(graded_statuses), 1))).label("graded"),
        )
        .select_from(Evaluation)
        .join(Submission, Evaluation.submission_id == Submission.id)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .where(Assignment.course_id.in_(course_ids_subq))
    )
    counts_row = (await db.execute(eval_counts)).one()
    pending_evaluations = int(counts_row.pending or 0)
    submissions_graded = int(counts_row.graded or 0)

    # Mean percentage across graded evaluations, normalised by each
    # assignment's max score so courses with different scales are comparable.
    effective_score = func.coalesce(Evaluation.final_score, Evaluation.ai_score)
    avg_pct_query = (
        select(func.avg(100.0 * effective_score / func.nullif(Assignment.max_score, 0)))
        .select_from(Evaluation)
        .join(Submission, Evaluation.submission_id == Submission.id)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .where(
            Assignment.course_id.in_(course_ids_subq),
            Evaluation.approval_status.in_(graded_statuses),
            effective_score.isnot(None),
        )
    )
    average_score = await db.scalar(avg_pct_query)

    result = AnalyticsOverviewOut(
        total_courses=int(total_courses or 0),
        total_students=int(total_students or 0),
        total_assignments=int(total_assignments or 0),
        total_submissions=int(total_submissions or 0),
        submissions_graded=submissions_graded,
        pending_evaluations=pending_evaluations,
        average_score=round(float(average_score), 1) if average_score is not None else 0.0,
    )

    logger.info(
        "analytics_overview",
        professor_id=str(professor.id),
        total_courses=result.total_courses,
        submissions_graded=result.submissions_graded,
        pending_evaluations=result.pending_evaluations,
    )

    return result
