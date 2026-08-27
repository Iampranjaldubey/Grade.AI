"""
Tests for the professor analytics overview endpoint.

The endpoint aggregates courses, students, assignments, submissions and
evaluation status across every course a professor owns. Evaluations are seeded
directly via the ORM (there's no API to create one without a live worker).
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    ApprovalStatus,
    EnrollmentStatus,
    GradingMode,
    SubmissionStatus,
    UserRole,
)
from app.models.enrollment import Enrollment
from app.models.evaluation import Evaluation
from app.models.submission import Submission


async def _register(client: AsyncClient, email: str, role: UserRole, name: str = "U") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "name": name,
            "role": role.value,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_course(client: AsyncClient, token: str, code: str) -> dict:
    resp = await client.post(
        "/api/v1/courses",
        headers={"Authorization": f"Bearer {token}"},
        json={"course_name": "C", "course_code": code, "semester": "Fall 2026"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_assignment(client: AsyncClient, token: str, course_id: str) -> dict:
    due = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    resp = await client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_id": course_id,
            "title": "A",
            "due_date": due,
            "max_score": "100",
            "grading_mode": GradingMode.HYBRID.value,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed_submission_with_eval(
    db_session: AsyncSession,
    course_id: str,
    assignment_id: str,
    student_id: str,
    approval_status: ApprovalStatus,
    ai_score: Decimal,
    final_score: Decimal | None,
) -> None:
    db_session.add(
        Enrollment(
            course_id=uuid.UUID(course_id),
            student_id=uuid.UUID(student_id),
            status=EnrollmentStatus.ACTIVE,
        )
    )
    submission = Submission(
        assignment_id=uuid.UUID(assignment_id),
        student_id=uuid.UUID(student_id),
        file_url="http://example.com/a.pdf",
        file_name="a.pdf",
        status=SubmissionStatus.SUBMITTED,
    )
    db_session.add(submission)
    await db_session.commit()
    await db_session.refresh(submission)

    approved_at = datetime.now(UTC) if approval_status != ApprovalStatus.PENDING else None
    db_session.add(
        Evaluation(
            submission_id=submission.id,
            ai_score=ai_score,
            final_score=final_score,
            ai_feedback={
                "criteria_scores": [],
                "percentage": 80.0,
                "confidence_score": 0.8,
            },
            approval_status=approval_status,
            evaluated_at=datetime.utcnow(),
            approved_at=approved_at,
        )
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_analytics_overview_aggregates(client: AsyncClient, db_session: AsyncSession) -> None:
    prof = await _register(client, "p_an1@gradeai.com", UserRole.PROFESSOR)
    s1 = await _register(client, "s_an1@gradeai.com", UserRole.STUDENT)
    s2 = await _register(client, "s_an2@gradeai.com", UserRole.STUDENT)
    token = prof["access_token"]
    course = await _create_course(client, token, "AN1")
    assignment = await _create_assignment(client, token, course["id"])

    # One approved evaluation (final_score 90 of 100 -> 90%).
    await _seed_submission_with_eval(
        db_session,
        course["id"],
        assignment["id"],
        s1["user"]["id"],
        ApprovalStatus.APPROVED,
        ai_score=Decimal("80"),
        final_score=Decimal("90"),
    )
    # One pending evaluation (not counted as graded, excluded from avg).
    await _seed_submission_with_eval(
        db_session,
        course["id"],
        assignment["id"],
        s2["user"]["id"],
        ApprovalStatus.PENDING,
        ai_score=Decimal("70"),
        final_score=None,
    )

    resp = await client.get("/api/v1/analytics", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["total_courses"] == 1
    assert data["total_students"] == 2
    assert data["total_assignments"] == 1
    assert data["total_submissions"] == 2
    assert data["submissions_graded"] == 1
    assert data["pending_evaluations"] == 1
    assert data["average_score"] == pytest.approx(90.0)


@pytest.mark.asyncio
async def test_analytics_overview_empty_for_new_professor(
    client: AsyncClient,
) -> None:
    prof = await _register(client, "p_an2@gradeai.com", UserRole.PROFESSOR)
    token = prof["access_token"]

    resp = await client.get("/api/v1/analytics", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data == {
        "total_courses": 0,
        "total_students": 0,
        "total_assignments": 0,
        "total_submissions": 0,
        "submissions_graded": 0,
        "pending_evaluations": 0,
        "average_score": 0.0,
    }


@pytest.mark.asyncio
async def test_analytics_overview_requires_professor(client: AsyncClient) -> None:
    student = await _register(client, "s_an3@gradeai.com", UserRole.STUDENT)
    token = student["access_token"]
    resp = await client.get("/api/v1/analytics", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403, resp.text
