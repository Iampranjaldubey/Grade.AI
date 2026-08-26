"""
Tests for Finding #10 fix: approve_evaluation / override_evaluation now perform
an atomic compare-and-swap (UPDATE ... WHERE approval_status='pending') so a
second action on an already-actioned evaluation cannot silently clobber the first.

Happy-path tests exercise the atomic UPDATE (rowcount=1 -> 200). The double-action
tests confirm a second call is rejected (the pre-check returns 400 for the common
already-actioned case; the atomic WHERE guard is the true race backstop).

A PENDING AI evaluation is inserted directly via the ORM (there's no API to create
one without a live Celery worker + Gemini).
"""
import uuid
from datetime import datetime, timedelta, timezone
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
        json={"email": email, "password": "securepass123", "name": name, "role": role.value},
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
    due = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
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


async def _seed_pending_evaluation(
    db_session: AsyncSession, course_id: str, assignment_id: str, student_id: str
) -> str:
    """Insert an active enrollment, a submission, and a PENDING AI evaluation."""
    db_session.add(Enrollment(
        course_id=uuid.UUID(course_id),
        student_id=uuid.UUID(student_id),
        status=EnrollmentStatus.ACTIVE,
    ))
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

    evaluation = Evaluation(
        submission_id=submission.id,
        ai_score=Decimal("80"),
        ai_feedback={"criteria_scores": [], "percentage": 80.0, "confidence_score": 0.8},
        approval_status=ApprovalStatus.PENDING,
        evaluated_at=datetime.utcnow(),
    )
    db_session.add(evaluation)
    await db_session.commit()
    await db_session.refresh(evaluation)
    return str(evaluation.id)


@pytest.mark.asyncio
async def test_approve_pending_evaluation_succeeds(client: AsyncClient, db_session: AsyncSession) -> None:
    prof = await _register(client, "p_ap1@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "s_ap1@gradeai.com", UserRole.STUDENT)
    token = prof["access_token"]
    course = await _create_course(client, token, "AP1")
    assignment = await _create_assignment(client, token, course["id"])
    eval_id = await _seed_pending_evaluation(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    resp = await client.post(
        f"/api/v1/evaluations/{eval_id}/approve",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["approval_status"] == "approved"
    assert float(data["final_score"]) == 80.0


@pytest.mark.asyncio
async def test_double_approve_is_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    prof = await _register(client, "p_ap2@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "s_ap2@gradeai.com", UserRole.STUDENT)
    token = prof["access_token"]
    course = await _create_course(client, token, "AP2")
    assignment = await _create_assignment(client, token, course["id"])
    eval_id = await _seed_pending_evaluation(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    first = await client.post(
        f"/api/v1/evaluations/{eval_id}/approve",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert first.status_code == 200, first.text

    second = await client.post(
        f"/api/v1/evaluations/{eval_id}/approve",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    # Row is no longer PENDING -> rejected (pre-check 400 or atomic guard 409).
    assert second.status_code in (400, 409)


@pytest.mark.asyncio
async def test_override_pending_evaluation_succeeds(client: AsyncClient, db_session: AsyncSession) -> None:
    prof = await _register(client, "p_ov1@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "s_ov1@gradeai.com", UserRole.STUDENT)
    token = prof["access_token"]
    course = await _create_course(client, token, "OV1")
    assignment = await _create_assignment(client, token, course["id"])
    eval_id = await _seed_pending_evaluation(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    resp = await client.post(
        f"/api/v1/evaluations/{eval_id}/override",
        headers={"Authorization": f"Bearer {token}"},
        json={"final_score": 92, "professor_feedback": "Adjusted after review"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["approval_status"] == "overridden"
    assert float(data["final_score"]) == 92.0
    assert data["professor_feedback"] == "Adjusted after review"


@pytest.mark.asyncio
async def test_approve_then_override_is_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    """Once approved, a subsequent override on the same row must not clobber it."""
    prof = await _register(client, "p_ov2@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "s_ov2@gradeai.com", UserRole.STUDENT)
    token = prof["access_token"]
    course = await _create_course(client, token, "OV2")
    assignment = await _create_assignment(client, token, course["id"])
    eval_id = await _seed_pending_evaluation(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    approve = await client.post(
        f"/api/v1/evaluations/{eval_id}/approve",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert approve.status_code == 200

    override = await client.post(
        f"/api/v1/evaluations/{eval_id}/override",
        headers={"Authorization": f"Bearer {token}"},
        json={"final_score": 10, "professor_feedback": "late override"},
    )
    assert override.status_code in (400, 409)

    # Confirm the original approval survived (final_score still 80, not 10).
    detail = await client.get(
        f"/api/v1/evaluations/{eval_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detail.status_code == 200
    assert float(detail.json()["final_score"]) == 80.0


@pytest.mark.asyncio
async def test_override_exceeding_max_score_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    prof = await _register(client, "p_ov3@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "s_ov3@gradeai.com", UserRole.STUDENT)
    token = prof["access_token"]
    course = await _create_course(client, token, "OV3")
    assignment = await _create_assignment(client, token, course["id"])
    eval_id = await _seed_pending_evaluation(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    resp = await client.post(
        f"/api/v1/evaluations/{eval_id}/override",
        headers={"Authorization": f"Bearer {token}"},
        json={"final_score": 150, "professor_feedback": "too high"},
    )
    assert resp.status_code == 400
