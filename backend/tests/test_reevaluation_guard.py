"""
Tests that AI re-grading can never discard a human grading decision.

Regression cover for a data-loss bug: POST /evaluations/trigger/{submission_id}
had no state guard, so re-running AI grading on an already approved or
overridden evaluation would overwrite the professor's score and feedback — and
in AUTO mode re-approve the AI's number over the top.

A *system* auto-approval (AUTO grading mode, approved_by NULL) is deliberately
still re-gradable, since no human has reviewed it yet.
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
from app.tasks.grading import (
    MANUAL_EVALUATION_EXISTS,
    PROFESSOR_APPROVAL_EXISTS,
    PROFESSOR_OVERRIDE_EXISTS,
    human_decision_reason,
)


async def _register(
    client: AsyncClient, email: str, role: UserRole, name: str = "Test User"
) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "securepass123", "name": name, "role": role.value},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_course(client: AsyncClient, token: str, course_code: str = "REG101") -> dict:
    response = await client.post(
        "/api/v1/courses",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_name": "Regression Testing",
            "course_code": course_code,
            "semester": "Fall 2026",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_assignment(
    client: AsyncClient, token: str, course_id: str, grading_mode: GradingMode
) -> dict:
    due_date = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    response = await client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_id": course_id,
            "title": "Essay 1",
            "description": "Write an essay",
            "due_date": due_date,
            "max_score": "100",
            "grading_mode": grading_mode.value,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


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


async def _add_evaluation(
    db_session: AsyncSession,
    submission_id: str,
    *,
    ai_score: Decimal | None,
    approval_status: ApprovalStatus,
    approved_by: str | None = None,
    final_score: Decimal | None = None,
) -> Evaluation:
    evaluation = Evaluation(
        submission_id=uuid.UUID(submission_id),
        ai_score=ai_score,
        final_score=final_score,
        ai_feedback={"criteria_scores": [], "percentage": 0.0, "confidence_score": 0.9},
        approval_status=approval_status,
        approved_by=uuid.UUID(approved_by) if approved_by else None,
        evaluated_at=datetime.now(UTC),
    )
    db_session.add(evaluation)
    await db_session.commit()
    await db_session.refresh(evaluation)
    return evaluation


# ---------------------------------------------------------------------------
# The shared rule, exercised directly
# ---------------------------------------------------------------------------


class _StubEvaluation:
    """Minimal stand-in exposing only what human_decision_reason inspects."""

    def __init__(
        self,
        ai_score: Decimal | None,
        approval_status: ApprovalStatus,
        approved_by: uuid.UUID | None,
    ) -> None:
        self.ai_score = ai_score
        self.approval_status = approval_status
        self.approved_by = approved_by


def test_manual_evaluation_is_protected() -> None:
    ev = _StubEvaluation(None, ApprovalStatus.PENDING, None)
    assert human_decision_reason(ev) == MANUAL_EVALUATION_EXISTS  # type: ignore[arg-type]


def test_professor_override_is_protected() -> None:
    ev = _StubEvaluation(Decimal("70"), ApprovalStatus.OVERRIDDEN, uuid.uuid4())
    assert human_decision_reason(ev) == PROFESSOR_OVERRIDE_EXISTS  # type: ignore[arg-type]


def test_professor_approval_is_protected() -> None:
    ev = _StubEvaluation(Decimal("70"), ApprovalStatus.APPROVED, uuid.uuid4())
    assert human_decision_reason(ev) == PROFESSOR_APPROVAL_EXISTS  # type: ignore[arg-type]


def test_system_auto_approval_stays_regradable() -> None:
    """AUTO mode approves with approved_by NULL; no human has reviewed it yet."""
    ev = _StubEvaluation(Decimal("70"), ApprovalStatus.APPROVED, None)
    assert human_decision_reason(ev) is None  # type: ignore[arg-type]


def test_pending_evaluation_is_regradable() -> None:
    ev = _StubEvaluation(Decimal("70"), ApprovalStatus.PENDING, None)
    assert human_decision_reason(ev) is None  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# The endpoint refuses rather than silently queueing a destructive task
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_trigger_rejected_after_professor_override(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    professor = await _register(client, "regprof1@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "regstud1@gradeai.com", UserRole.STUDENT)
    token = professor["access_token"]

    course = await _create_course(client, token, "REG101")
    assignment = await _create_assignment(client, token, course["id"], GradingMode.AUTO)
    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    await _add_evaluation(
        db_session,
        submission_id,
        ai_score=Decimal("55"),
        approval_status=ApprovalStatus.OVERRIDDEN,
        approved_by=professor["user"]["id"],
        final_score=Decimal("88"),
    )

    response = await client.post(
        f"/api/v1/evaluations/trigger/{submission_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409, response.text
    # The app's exception handler normalises errors to {code, message, request_id}.
    assert "discard your score" in response.json()["message"]


@pytest.mark.asyncio
async def test_trigger_rejected_after_professor_approval(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    professor = await _register(client, "regprof2@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "regstud2@gradeai.com", UserRole.STUDENT)
    token = professor["access_token"]

    course = await _create_course(client, token, "REG102")
    assignment = await _create_assignment(client, token, course["id"], GradingMode.HYBRID)
    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    await _add_evaluation(
        db_session,
        submission_id,
        ai_score=Decimal("72"),
        approval_status=ApprovalStatus.APPROVED,
        approved_by=professor["user"]["id"],
        final_score=Decimal("72"),
    )

    response = await client.post(
        f"/api/v1/evaluations/trigger/{submission_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409, response.text
    assert "already approved" in response.json()["message"]


@pytest.mark.asyncio
async def test_trigger_rejected_for_manual_evaluation(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    professor = await _register(client, "regprof3@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "regstud3@gradeai.com", UserRole.STUDENT)
    token = professor["access_token"]

    course = await _create_course(client, token, "REG103")
    assignment = await _create_assignment(client, token, course["id"], GradingMode.MANUAL)
    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    await _add_evaluation(
        db_session,
        submission_id,
        ai_score=None,
        approval_status=ApprovalStatus.OVERRIDDEN,
        approved_by=professor["user"]["id"],
        final_score=Decimal("90"),
    )

    response = await client.post(
        f"/api/v1/evaluations/trigger/{submission_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409, response.text
    assert "graded manually" in response.json()["message"]


@pytest.mark.asyncio
async def test_trigger_allowed_for_pending_evaluation(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A pending AI grade has had no human input, so re-grading is permitted."""
    professor = await _register(client, "regprof4@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "regstud4@gradeai.com", UserRole.STUDENT)
    token = professor["access_token"]

    course = await _create_course(client, token, "REG104")
    assignment = await _create_assignment(client, token, course["id"], GradingMode.AUTO)
    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    await _add_evaluation(
        db_session,
        submission_id,
        ai_score=Decimal("61"),
        approval_status=ApprovalStatus.PENDING,
    )

    # Don't hand the task to a real broker.
    queued: list[str] = []

    class _FakeTask:
        id = "fake-task-id"

    def _fake_delay(sid: str) -> _FakeTask:
        queued.append(sid)
        return _FakeTask()

    monkeypatch.setattr("app.api.v1.endpoints.evaluations.evaluate_submission.delay", _fake_delay)

    response = await client.post(
        f"/api/v1/evaluations/trigger/{submission_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200, response.text
    assert queued == [submission_id]


@pytest.mark.asyncio
async def test_trigger_allowed_when_no_evaluation_exists(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    professor = await _register(client, "regprof5@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "regstud5@gradeai.com", UserRole.STUDENT)
    token = professor["access_token"]

    course = await _create_course(client, token, "REG105")
    assignment = await _create_assignment(client, token, course["id"], GradingMode.AUTO)
    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    queued: list[str] = []

    class _FakeTask:
        id = "fake-task-id"

    def _fake_delay(sid: str) -> _FakeTask:
        queued.append(sid)
        return _FakeTask()

    monkeypatch.setattr("app.api.v1.endpoints.evaluations.evaluate_submission.delay", _fake_delay)

    response = await client.post(
        f"/api/v1/evaluations/trigger/{submission_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200, response.text
    assert queued == [submission_id]
