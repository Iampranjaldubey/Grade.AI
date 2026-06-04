import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient) -> None:
    register_response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "teacher@gradeai.com",
            "password": "securepass123",
            "name": "Test Teacher",
        },
    )
    print(register_response.json())
    assert register_response.status_code == 201
    assert register_response.json()["email"] == "teacher@gradeai.com"

    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": "teacher@gradeai.com", "password": "securepass123"},
    )
    assert login_response.status_code == 200
    assert "access_token" in login_response.json()
