"""
Tests for Finding #7 fix: presigned download URLs are regenerated on read from
the stored file_key, so historical submissions/documents never return an expired
link. The DB stores a snapshot URL that expires 24h after upload; read endpoints
must not serve that stale value when a file_key is available.

S3 presigning is mocked so no live MinIO is required.
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EnrollmentStatus, GradingMode, SubmissionStatus, UserRole
from app.models.enrollment import Enrollment
from app.models.submission import Submission

STALE_URL = "http://minio:9000/bucket/key.pdf?X-Amz-Expired=stale-snapshot"
FRESH_URL = "http://minio:9000/bucket/key.pdf?X-Amz-Signature=freshly-generated"


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
    due = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    resp = await client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_id": course_id,
            "title": "A",
            "due_date": due,
            "max_score": "100",
            "grading_mode": GradingMode.MANUAL.value,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed_submission(
    db_session: AsyncSession,
    course_id: str,
    assignment_id: str,
    student_id: str,
    *,
    file_key: str | None,
) -> None:
    db_session.add(
        Enrollment(
            course_id=uuid.UUID(course_id),
            student_id=uuid.UUID(student_id),
            status=EnrollmentStatus.ACTIVE,
        )
    )
    db_session.add(
        Submission(
            assignment_id=uuid.UUID(assignment_id),
            student_id=uuid.UUID(student_id),
            file_url=STALE_URL,  # simulates the expired snapshot stored at upload time
            file_key=file_key,
            file_name="a.pdf",
            status=SubmissionStatus.SUBMITTED,
        )
    )
    await db_session.commit()


@pytest.fixture
def mock_s3(monkeypatch):
    """Presigning returns a recognizable FRESH_URL; construction avoids real MinIO."""
    fake = MagicMock()
    fake.generate_presigned_download_url.return_value = FRESH_URL
    monkeypatch.setattr("app.api.v1.endpoints.submissions.get_s3_service", lambda settings: fake)
    return fake


@pytest.mark.asyncio
async def test_my_submission_returns_freshly_signed_url(
    client: AsyncClient, db_session: AsyncSession, mock_s3
) -> None:
    prof = await _register(client, "p_u1@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "s_u1@gradeai.com", UserRole.STUDENT)
    course = await _create_course(client, prof["access_token"], "URL1")
    assignment = await _create_assignment(client, prof["access_token"], course["id"])
    await _seed_submission(
        db_session,
        course["id"],
        assignment["id"],
        student["user"]["id"],
        file_key="URL1/submission/abc_a.pdf",
    )

    resp = await client.get(
        f"/api/v1/submissions/{assignment['id']}/my-submission",
        headers={"Authorization": f"Bearer {student['access_token']}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["file_url"] == FRESH_URL
    mock_s3.generate_presigned_download_url.assert_called_once_with(
        "URL1/submission/abc_a.pdf", expires=3600
    )


@pytest.mark.asyncio
async def test_all_submissions_returns_freshly_signed_urls(
    client: AsyncClient, db_session: AsyncSession, mock_s3
) -> None:
    prof = await _register(client, "p_u2@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "s_u2@gradeai.com", UserRole.STUDENT)
    course = await _create_course(client, prof["access_token"], "URL2")
    assignment = await _create_assignment(client, prof["access_token"], course["id"])
    await _seed_submission(
        db_session,
        course["id"],
        assignment["id"],
        student["user"]["id"],
        file_key="URL2/submission/def_a.pdf",
    )

    resp = await client.get(
        f"/api/v1/submissions/{assignment['id']}/all",
        headers={"Authorization": f"Bearer {prof['access_token']}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 1
    assert body[0]["file_url"] == FRESH_URL


@pytest.mark.asyncio
async def test_legacy_submission_without_file_key_falls_back_to_stored_url(
    client: AsyncClient, db_session: AsyncSession, mock_s3
) -> None:
    """Legacy rows predating file_key persistence keep serving the stored URL."""
    prof = await _register(client, "p_u3@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, "s_u3@gradeai.com", UserRole.STUDENT)
    course = await _create_course(client, prof["access_token"], "URL3")
    assignment = await _create_assignment(client, prof["access_token"], course["id"])
    await _seed_submission(
        db_session,
        course["id"],
        assignment["id"],
        student["user"]["id"],
        file_key=None,
    )

    resp = await client.get(
        f"/api/v1/submissions/{assignment['id']}/my-submission",
        headers={"Authorization": f"Bearer {student['access_token']}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["file_url"] == STALE_URL
    mock_s3.generate_presigned_download_url.assert_not_called()
