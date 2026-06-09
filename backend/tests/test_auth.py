import pytest
from httpx import AsyncClient

from app.core.enums import UserRole


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
    assert register_response.status_code == 201
    register_data = register_response.json()
    assert register_data["user"]["email"] == "teacher@gradeai.com"
    assert "access_token" in register_data
    assert "refresh_token" in register_data
    assert register_data["expires_in"] == 900

    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": "teacher@gradeai.com", "password": "securepass123"},
    )
    assert login_response.status_code == 200
    login_data = login_response.json()
    assert "access_token" in login_data
    assert "refresh_token" in login_data


@pytest.mark.asyncio
async def test_refresh_logout_and_me(client: AsyncClient) -> None:
    register = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "student@gradeai.com",
            "password": "securepass123",
            "name": "Test Student",
            "role": UserRole.STUDENT.value,
        },
    )
    tokens = register.json()
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    me_response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "student@gradeai.com"

    refresh_response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_response.status_code == 200
    new_tokens = refresh_response.json()
    assert new_tokens["user"] is None
    assert "access_token" in new_tokens

    logout_response = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {new_tokens['access_token']}"},
        json={"refresh_token": new_tokens["refresh_token"]},
    )
    assert logout_response.status_code == 200
    assert logout_response.json()["message"] == "logged out"

    revoked_me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {new_tokens['access_token']}"},
    )
    assert revoked_me.status_code == 401


@pytest.mark.asyncio
async def test_login_lockout(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "lockout@gradeai.com",
            "password": "correctpass123",
            "name": "Lockout User",
        },
    )

    for _ in range(5):
        await client.post(
            "/api/v1/auth/login",
            json={"email": "lockout@gradeai.com", "password": "wrongpassword"},
        )

    locked = await client.post(
        "/api/v1/auth/login",
        json={"email": "lockout@gradeai.com", "password": "wrongpassword"},
    )
    assert locked.status_code == 429
