import pytest
from httpx import AsyncClient

from app.core.enums import UserRole


@pytest.mark.asyncio
async def test_professor_courses_requires_auth(client: AsyncClient) -> None:
    response = await client.get("/api/v1/courses")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_professor_courses_with_role(client: AsyncClient) -> None:
    register = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "prof@gradeai.com",
            "password": "securepass123",
            "name": "Professor",
            "role": UserRole.PROFESSOR.value,
        },
    )
    assert register.status_code == 201
    token = register.json()["access_token"]
    response = await client.get(
        "/api/v1/courses",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json() == []
