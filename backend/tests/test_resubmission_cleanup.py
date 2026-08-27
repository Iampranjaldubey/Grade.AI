"""
Tests for NEW-2: on resubmission, the previous attempt's submission Document(s)
and their ChromaDB vectors are removed (no leak) and the stale Evaluation is
deleted so the new submission is re-graded from scratch (rather than being
blocked by a prior manual grade via the ai_score-None skip guard).
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    ApprovalStatus,
    DocumentType,
    EnrollmentStatus,
    GradingMode,
    UserRole,
)
from app.models.document import Document
from app.models.enrollment import Enrollment
from app.models.evaluation import Evaluation


async def _register(client: AsyncClient, email: str, role: UserRole) -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "securepass123", "name": "U", "role": role.value},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.fixture
def mock_backends(monkeypatch):
    s3 = MagicMock()
    s3.file_exists.return_value = True
    s3.get_file_size.return_value = 1000
    s3.generate_presigned_download_url.return_value = "http://minio/dl"
    chroma = MagicMock()
    monkeypatch.setattr("app.api.v1.endpoints.submissions.get_s3_service", lambda settings: s3)
    monkeypatch.setattr("app.api.v1.endpoints.submissions.ChromaDBClient", lambda settings: chroma)
    return s3, chroma


async def _setup(client: AsyncClient, db_session: AsyncSession, code: str) -> tuple[str, str, str]:
    prof = await _register(client, f"p_{code}@gradeai.com", UserRole.PROFESSOR)
    student = await _register(client, f"s_{code}@gradeai.com", UserRole.STUDENT)
    course = await client.post(
        "/api/v1/courses",
        headers={"Authorization": f"Bearer {prof['access_token']}"},
        json={"course_name": "C", "course_code": code, "semester": "F26"},
    )
    course_id = course.json()["id"]
    due = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    assignment = await client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {prof['access_token']}"},
        json={
            "course_id": course_id,
            "title": "A",
            "due_date": due,
            "max_score": "100",
            "grading_mode": GradingMode.HYBRID.value,
        },
    )
    assignment_id = assignment.json()["id"]
    # Enroll the student directly.
    db_session.add(
        Enrollment(
            course_id=uuid.UUID(course_id),
            student_id=uuid.UUID(student["user"]["id"]),
            status=EnrollmentStatus.ACTIVE,
        )
    )
    await db_session.commit()
    return student["access_token"], assignment_id, student["user"]["id"]


async def _submit(client: AsyncClient, token: str, assignment_id: str, name: str) -> dict:
    resp = await client.post(
        "/api/v1/submissions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "assignment_id": assignment_id,
            "file_name": name,
            "file_key": f"key/{uuid.uuid4()}_{name}",
            "file_size_bytes": 1000,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_resubmission_does_not_leak_documents(
    client: AsyncClient, db_session: AsyncSession, mock_backends
) -> None:
    s3, chroma = mock_backends
    token, aid, student_id = await _setup(client, db_session, "RS1")

    await _submit(client, token, aid, "v1.pdf")
    await _submit(client, token, aid, "v2.pdf")  # resubmission

    # Exactly one submission Document should remain (old one cleaned up).
    count = await db_session.execute(
        select(func.count()).where(
            Document.assignment_id == uuid.UUID(aid),
            Document.uploader_id == uuid.UUID(student_id),
            Document.doc_type == DocumentType.SUBMISSION,
        )
    )
    assert count.scalar_one() == 1
    # Old document's vectors were cleaned from ChromaDB.
    chroma.delete_document_chunks.assert_called()


@pytest.mark.asyncio
async def test_resubmission_deletes_stale_manual_evaluation(
    client: AsyncClient, db_session: AsyncSession, mock_backends
) -> None:
    token, aid, student_id = await _setup(client, db_session, "RS2")

    first = await _submit(client, token, aid, "v1.pdf")
    submission_id = uuid.UUID(first["id"])

    # Simulate a prior manual grade (ai_score None) attached to the first attempt.
    db_session.add(
        Evaluation(
            submission_id=submission_id,
            ai_score=None,
            final_score=70,
            professor_feedback="graded v1",
            approval_status=ApprovalStatus.OVERRIDDEN,
            evaluated_at=datetime.utcnow(),
        )
    )
    await db_session.commit()

    await _submit(client, token, aid, "v2.pdf")  # resubmission

    # The stale evaluation must be gone so the new submission can be re-graded.
    remaining = await db_session.execute(
        select(func.count()).where(Evaluation.submission_id == submission_id)
    )
    assert remaining.scalar_one() == 0
