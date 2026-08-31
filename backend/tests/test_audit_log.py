"""
Tests that grade decisions are written to the audit trail.

The audit_logs table existed from the first migration but was never populated,
so "who changed this grade, when, and from what" lived only in log output. For a
grading system that record needs to be durable and queryable.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    ApprovalStatus,
    EnrollmentStatus,
    GradingMode,
    SubmissionStatus,
    UserRole,
)
from app.models.audit_log import AuditLog
from app.models.enrollment import Enrollment
from app.models.evaluation import Evaluation
from app.models.submission import Submission
from app.services.audit_service import (
    ACTION_EVALUATION_APPROVED,
    ACTION_EVALUATION_MANUAL_CREATED,
    ACTION_EVALUATION_OVERRIDDEN,
    ENTITY_EVALUATION,
)


async def _register(client: AsyncClient, email: str, role: UserRole) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "name": "Audit Test",
            "role": role.value,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _course_and_assignment(
    client: AsyncClient, token: str, code: str, mode: GradingMode
) -> tuple[dict, dict]:
    course_response = await client.post(
        "/api/v1/courses",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_name": "Auditing 101",
            "course_code": code,
            "semester": "Fall 2026",
        },
    )
    assert course_response.status_code == 201, course_response.text
    course = course_response.json()

    due_date = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    assignment_response = await client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_id": course["id"],
            "title": "Essay",
            "due_date": due_date,
            "max_score": "100",
            "grading_mode": mode.value,
        },
    )
    assert assignment_response.status_code == 201, assignment_response.text
    return course, assignment_response.json()


async def _enroll_and_submit(
    db_session: AsyncSession, course_id: str, assignment_id: str, student_id: str
) -> str:
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
        file_url="http://example.com/fake.pdf",
        file_name="fake.pdf",
        status=SubmissionStatus.SUBMITTED,
    )
    db_session.add(submission)
    await db_session.commit()
    await db_session.refresh(submission)
    return str(submission.id)


async def _pending_ai_evaluation(db_session: AsyncSession, submission_id: str) -> Evaluation:
    evaluation = Evaluation(
        submission_id=uuid.UUID(submission_id),
        ai_score=Decimal("70"),
        ai_feedback={"criteria_scores": [], "percentage": 70.0, "confidence_score": 0.9},
        approval_status=ApprovalStatus.PENDING,
        evaluated_at=datetime.now(UTC),
    )
    db_session.add(evaluation)
    await db_session.commit()
    await db_session.refresh(evaluation)
    return evaluation


async def _audit_entries(db_session: AsyncSession, entity_id: uuid.UUID) -> list[AuditLog]:
    result = await db_session.execute(select(AuditLog).where(AuditLog.entity_id == entity_id))
    return list(result.scalars().all())


@pytest.mark.asyncio
async def test_approval_is_audited(client: AsyncClient, db_session: AsyncSession) -> None:
    professor = await _register(client, "auditprof1@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "auditstud1@gradeai.com", UserRole.STUDENT)
    token = professor["access_token"]

    course, assignment = await _course_and_assignment(client, token, "AUD101", GradingMode.HYBRID)
    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )
    evaluation = await _pending_ai_evaluation(db_session, submission_id)

    response = await client.post(
        f"/api/v1/evaluations/{evaluation.id}/approve",
        headers={"Authorization": f"Bearer {token}"},
        json={"professor_feedback": "Looks right."},
    )
    assert response.status_code == 200, response.text

    entries = await _audit_entries(db_session, evaluation.id)
    assert len(entries) == 1
    entry = entries[0]
    assert entry.action == ACTION_EVALUATION_APPROVED
    assert entry.entity_type == ENTITY_EVALUATION
    assert entry.user_id == uuid.UUID(professor["user"]["id"])
    assert entry.new_value is not None
    assert entry.new_value["approval_status"] == ApprovalStatus.APPROVED.value
    assert entry.new_value["final_score"] == 70.0


@pytest.mark.asyncio
async def test_override_audit_records_the_replaced_ai_score(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """The point of the trail: what the AI said, and what the human chose instead."""
    professor = await _register(client, "auditprof2@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "auditstud2@gradeai.com", UserRole.STUDENT)
    token = professor["access_token"]

    course, assignment = await _course_and_assignment(client, token, "AUD102", GradingMode.HYBRID)
    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )
    evaluation = await _pending_ai_evaluation(db_session, submission_id)

    response = await client.post(
        f"/api/v1/evaluations/{evaluation.id}/override",
        headers={"Authorization": f"Bearer {token}"},
        json={"final_score": 92, "professor_feedback": "Stronger than the AI credited."},
    )
    assert response.status_code == 200, response.text

    entries = await _audit_entries(db_session, evaluation.id)
    assert len(entries) == 1
    entry = entries[0]
    assert entry.action == ACTION_EVALUATION_OVERRIDDEN
    assert entry.old_value is not None
    assert entry.old_value["ai_score"] == 70.0
    assert entry.new_value is not None
    assert entry.new_value["final_score"] == 92.0
    assert "Stronger than" in entry.new_value["professor_feedback"]


@pytest.mark.asyncio
async def test_manual_evaluation_is_audited(client: AsyncClient, db_session: AsyncSession) -> None:
    professor = await _register(client, "auditprof3@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "auditstud3@gradeai.com", UserRole.STUDENT)
    token = professor["access_token"]

    course, assignment = await _course_and_assignment(client, token, "AUD103", GradingMode.MANUAL)
    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    response = await client.post(
        f"/api/v1/evaluations/manual/{submission_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"final_score": 81.5, "professor_feedback": "Graded by hand."},
    )
    assert response.status_code == 200, response.text
    evaluation_id = uuid.UUID(response.json()["id"])

    entries = await _audit_entries(db_session, evaluation_id)
    assert len(entries) == 1
    entry = entries[0]
    assert entry.action == ACTION_EVALUATION_MANUAL_CREATED
    assert entry.old_value is None
    assert entry.new_value is not None
    assert entry.new_value["ai_score"] is None
    assert entry.new_value["final_score"] == 81.5
