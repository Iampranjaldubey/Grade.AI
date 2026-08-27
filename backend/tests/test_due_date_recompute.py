"""
Test for Finding #15: editing an assignment's due_date recomputes the on-time/
late status of existing not-yet-evaluated submissions, instead of leaving a stale
'late' flag frozen from submission time.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import GradingMode, SubmissionStatus, UserRole
from app.models.submission import Submission


async def _prof_with_assignment(client: AsyncClient, code: str, due_days: int) -> tuple[str, str]:
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"{code}@gradeai.com",
            "password": "securepass123",
            "name": "P",
            "role": UserRole.PROFESSOR.value,
        },
    )
    token = reg.json()["access_token"]
    course = await client.post(
        "/api/v1/courses",
        headers={"Authorization": f"Bearer {token}"},
        json={"course_name": "C", "course_code": code, "semester": "F26"},
    )
    due = (datetime.now(UTC) + timedelta(days=due_days)).isoformat()
    assignment = await client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_id": course.json()["id"],
            "title": "A",
            "due_date": due,
            "max_score": "100",
            "grading_mode": GradingMode.HYBRID.value,
        },
    )
    return token, assignment.json()["id"]


@pytest.mark.asyncio
async def test_extending_due_date_flips_late_submission_to_on_time(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token, aid = await _prof_with_assignment(client, "DD1", due_days=5)

    # Seed a LATE submission whose submitted_at is in the past.
    sub = Submission(
        assignment_id=uuid.UUID(aid),
        student_id=uuid.uuid4(),
        file_url="http://x/a.pdf",
        file_name="a.pdf",
        submitted_at=datetime.now(UTC) - timedelta(days=10),
        status=SubmissionStatus.LATE,
    )
    db_session.add(sub)
    await db_session.commit()
    await db_session.refresh(sub)

    # Extend the due date to the future; submitted_at (10 days ago) now precedes it.
    new_due = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    resp = await client.put(
        f"/api/v1/assignments/{aid}",
        headers={"Authorization": f"Bearer {token}"},
        json={"due_date": new_due},
    )
    assert resp.status_code == 200, resp.text

    refreshed = await db_session.execute(select(Submission).where(Submission.id == sub.id))
    assert refreshed.scalar_one().status == SubmissionStatus.SUBMITTED


@pytest.mark.asyncio
async def test_update_without_due_date_change_leaves_status(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token, aid = await _prof_with_assignment(client, "DD2", due_days=5)

    sub = Submission(
        assignment_id=uuid.UUID(aid),
        student_id=uuid.uuid4(),
        file_url="http://x/a.pdf",
        file_name="a.pdf",
        submitted_at=datetime.now(UTC) - timedelta(days=10),
        status=SubmissionStatus.LATE,
    )
    db_session.add(sub)
    await db_session.commit()
    await db_session.refresh(sub)

    resp = await client.put(
        f"/api/v1/assignments/{aid}",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Renamed"},
    )
    assert resp.status_code == 200, resp.text

    refreshed = await db_session.execute(select(Submission).where(Submission.id == sub.id))
    assert refreshed.scalar_one().status == SubmissionStatus.LATE  # untouched
