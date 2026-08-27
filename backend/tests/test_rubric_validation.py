"""
Test for Finding #12: rubric criteria max_points must sum to the assignment's
max_score (previously validated nowhere - not in schema, endpoint, or DB).
"""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.core.enums import GradingMode, UserRole


async def _prof_with_assignment(
    client: AsyncClient, code: str, max_score: str = "100"
) -> tuple[str, str]:
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
    due = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    assignment = await client.post(
        "/api/v1/assignments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "course_id": course.json()["id"],
            "title": "A",
            "due_date": due,
            "max_score": max_score,
            "grading_mode": GradingMode.HYBRID.value,
        },
    )
    return token, assignment.json()["id"]


@pytest.mark.asyncio
async def test_rubrics_summing_to_max_score_accepted(client: AsyncClient) -> None:
    token, aid = await _prof_with_assignment(client, "RB1", max_score="100")
    resp = await client.post(
        f"/api/v1/assignments/{aid}/rubrics",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "criteria": [
                {"criteria_name": "Content", "max_points": 60, "weight": 60},
                {"criteria_name": "Style", "max_points": 40, "weight": 40},
            ]
        },
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_rubrics_not_summing_to_max_score_rejected(client: AsyncClient) -> None:
    token, aid = await _prof_with_assignment(client, "RB2", max_score="100")
    # max_points sum to 80, not 100 (weights still sum to 100 to pass schema check).
    resp = await client.post(
        f"/api/v1/assignments/{aid}/rubrics",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "criteria": [
                {"criteria_name": "Content", "max_points": 50, "weight": 60},
                {"criteria_name": "Style", "max_points": 30, "weight": 40},
            ]
        },
    )
    assert resp.status_code == 400, resp.text
    assert "max_points" in resp.json()["message"]
