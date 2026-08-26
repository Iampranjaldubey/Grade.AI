"""
Tests for the manual grading feature:
- POST /evaluations/manual/{submission_id}
- Interaction with /evaluations/{id}/approve when ai_score is NULL

Submissions/enrollments are inserted directly via the ORM (bypassing the
submission HTTP endpoint) to avoid depending on a live S3/MinIO backend,
which is unrelated to what these tests are verifying.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EnrollmentStatus, GradingMode, SubmissionStatus, UserRole
from app.models.enrollment import Enrollment
from app.models.submission import Submission


async def _register(client: AsyncClient, email: str, role: UserRole, name: str = "Test User") -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "securepass123", "name": name, "role": role.value},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_course(client: AsyncClient, token: str, course_code: str = "TST101") -> dict:
    response = await client.post(
        "/api/v1/courses",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_name": "Intro to Testing",
            "course_code": course_code,
            "semester": "Fall 2026",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_assignment(
    client: AsyncClient,
    token: str,
    course_id: str,
    grading_mode: GradingMode,
    max_score: str = "100",
) -> dict:
    due_date = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    response = await client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_id": course_id,
            "title": "Essay 1",
            "description": "Write an essay",
            "due_date": due_date,
            "max_score": max_score,
            "grading_mode": grading_mode.value,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _enroll_and_submit(
    db_session: AsyncSession, course_id: str, assignment_id: str, student_id: str
) -> str:
    """Directly insert Enrollment + Submission rows, bypassing HTTP/S3 dependencies."""
    enrollment = Enrollment(
        course_id=uuid.UUID(course_id),
        student_id=uuid.UUID(student_id),
        status=EnrollmentStatus.ACTIVE,
    )
    db_session.add(enrollment)

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


@pytest.mark.asyncio
async def test_manual_evaluation_created_successfully(client: AsyncClient, db_session: AsyncSession) -> None:
    professor = await _register(client, "prof1@gradeai.com", UserRole.PROFESSOR, "Prof One")
    student = await _register(client, "student1@gradeai.com", UserRole.STUDENT, "Student One")

    prof_token = professor["access_token"]
    course = await _create_course(client, prof_token)
    assignment = await _create_assignment(client, prof_token, course["id"], GradingMode.MANUAL)

    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    response = await client.post(
        f"/api/v1/evaluations/manual/{submission_id}",
        headers={"Authorization": f"Bearer {prof_token}"},
        json={
            "final_score": 85.5,
            "professor_feedback": "Good work overall.",
            "criteria_scores": [{"criterion": "Content", "score": 40, "max": 50}],
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["ai_score"] is None
    assert float(data["final_score"]) == 85.5
    assert data["approval_status"] == "overridden"
    assert data["professor_feedback"] == "Good work overall."


@pytest.mark.asyncio
async def test_manual_evaluation_duplicate_returns_409(client: AsyncClient, db_session: AsyncSession) -> None:
    professor = await _register(client, "prof2@gradeai.com", UserRole.PROFESSOR, "Prof Two")
    student = await _register(client, "student2@gradeai.com", UserRole.STUDENT, "Student Two")

    prof_token = professor["access_token"]
    course = await _create_course(client, prof_token, course_code="TST102")
    assignment = await _create_assignment(client, prof_token, course["id"], GradingMode.MANUAL)
    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    first = await client.post(
        f"/api/v1/evaluations/manual/{submission_id}",
        headers={"Authorization": f"Bearer {prof_token}"},
        json={"final_score": 70, "professor_feedback": "OK"},
    )
    assert first.status_code == 200, first.text

    second = await client.post(
        f"/api/v1/evaluations/manual/{submission_id}",
        headers={"Authorization": f"Bearer {prof_token}"},
        json={"final_score": 90, "professor_feedback": "Trying again"},
    )
    assert second.status_code == 409
    # Custom exception handler (app/core/handlers.py) reformats HTTPException
    # detail into a "message" field, not the default "detail" key.
    assert "already exists" in second.json()["message"].lower()


@pytest.mark.asyncio
async def test_manual_evaluation_score_exceeds_max_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    professor = await _register(client, "prof3@gradeai.com", UserRole.PROFESSOR, "Prof Three")
    student = await _register(client, "student3@gradeai.com", UserRole.STUDENT, "Student Three")

    prof_token = professor["access_token"]
    course = await _create_course(client, prof_token, course_code="TST103")
    assignment = await _create_assignment(
        client, prof_token, course["id"], GradingMode.MANUAL, max_score="100"
    )
    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    response = await client.post(
        f"/api/v1/evaluations/manual/{submission_id}",
        headers={"Authorization": f"Bearer {prof_token}"},
        json={"final_score": 150, "professor_feedback": "Too high"},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_manual_evaluation_wrong_professor_returns_403(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    professor = await _register(client, "prof4@gradeai.com", UserRole.PROFESSOR, "Prof Four")
    other_professor = await _register(client, "prof5@gradeai.com", UserRole.PROFESSOR, "Prof Five")
    student = await _register(client, "student4@gradeai.com", UserRole.STUDENT, "Student Four")

    prof_token = professor["access_token"]
    other_token = other_professor["access_token"]

    course = await _create_course(client, prof_token, course_code="TST104")
    assignment = await _create_assignment(client, prof_token, course["id"], GradingMode.MANUAL)
    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    response = await client.post(
        f"/api/v1/evaluations/manual/{submission_id}",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"final_score": 50, "professor_feedback": "Not my course"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_manual_evaluation_nonexistent_submission_returns_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    professor = await _register(client, "prof7@gradeai.com", UserRole.PROFESSOR, "Prof Seven")
    prof_token = professor["access_token"]

    fake_submission_id = str(uuid.uuid4())
    response = await client.post(
        f"/api/v1/evaluations/manual/{fake_submission_id}",
        headers={"Authorization": f"Bearer {prof_token}"},
        json={"final_score": 50, "professor_feedback": "Nope"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_cannot_approve_manual_evaluation(client: AsyncClient, db_session: AsyncSession) -> None:
    """
    Manual evaluations are created with approval_status=OVERRIDDEN (not PENDING)
    and ai_score=None, so /approve must reject them regardless of which specific
    guard clause triggers first.
    """
    professor = await _register(client, "prof6@gradeai.com", UserRole.PROFESSOR, "Prof Six")
    student = await _register(client, "student6@gradeai.com", UserRole.STUDENT, "Student Six")

    prof_token = professor["access_token"]
    course = await _create_course(client, prof_token, course_code="TST106")
    assignment = await _create_assignment(client, prof_token, course["id"], GradingMode.MANUAL)
    submission_id = await _enroll_and_submit(
        db_session, course["id"], assignment["id"], student["user"]["id"]
    )

    create_response = await client.post(
        f"/api/v1/evaluations/manual/{submission_id}",
        headers={"Authorization": f"Bearer {prof_token}"},
        json={"final_score": 60, "professor_feedback": "Manual grade"},
    )
    assert create_response.status_code == 200, create_response.text
    evaluation_id = create_response.json()["id"]

    approve_response = await client.post(
        f"/api/v1/evaluations/{evaluation_id}/approve",
        headers={"Authorization": f"Bearer {prof_token}"},
        json={},
    )
    assert approve_response.status_code == 400


@pytest.mark.asyncio
async def test_manual_evaluation_requires_professor_role(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    student = await _register(client, "student8@gradeai.com", UserRole.STUDENT, "Student Eight")
    response = await client.post(
        f"/api/v1/evaluations/manual/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {student['access_token']}"},
        json={"final_score": 50, "professor_feedback": "Should not work"},
    )
    assert response.status_code == 403
