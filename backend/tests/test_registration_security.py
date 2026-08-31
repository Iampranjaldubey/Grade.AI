"""
Tests for the two registration/upload abuse protections:

1. Privileged roles (professor/TA/admin) cannot be self-assigned from the public
   /auth/register endpoint once a PROFESSOR_REGISTRATION_CODE is configured.
   Without this, anyone could register as a professor and grade real work.
2. Fixed-window rate limiting, so registration and presigned-URL minting can't
   be called without bound.

The registration code is intentionally unset in development/test so local setup
stays frictionless; production cannot boot without it (Settings.validate_required).
"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import AsyncClient

from app.core.config import Settings, get_settings
from app.core.enums import UserRole
from app.core.rate_limit import RateLimiter, _client_key
from tests.fake_redis import FakeRedis

REGISTRATION_CODE = "faculty-code-123"


def _settings_with_code(code: str) -> Settings:
    """
    A real Settings copy with only the registration code overridden.

    Deliberately not a hand-rolled stub: the auth module reads several settings,
    so a partial fake would break whenever another one is used.
    """
    return get_settings().model_copy(update={"professor_registration_code": code})


def _fake_request(host: str = "10.0.0.1", forwarded: str | None = None) -> SimpleNamespace:
    headers = {"x-forwarded-for": forwarded} if forwarded else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=host))


# ---------------------------------------------------------------------------
# Privileged role self-assignment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_professor_registration_rejected_without_code(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "app.api.v1.endpoints.auth.get_settings",
        lambda: _settings_with_code(REGISTRATION_CODE),
    )

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "sneaky@example.com",
            "password": "securepass123",
            "name": "Sneaky",
            "role": UserRole.PROFESSOR.value,
        },
    )

    assert response.status_code == 403, response.text
    assert "registration code" in response.json()["message"]


@pytest.mark.asyncio
async def test_professor_registration_rejected_with_wrong_code(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "app.api.v1.endpoints.auth.get_settings",
        lambda: _settings_with_code(REGISTRATION_CODE),
    )

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "sneaky2@example.com",
            "password": "securepass123",
            "name": "Sneaky",
            "role": UserRole.PROFESSOR.value,
            "registration_code": "not-the-code",
        },
    )

    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_professor_registration_allowed_with_correct_code(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "app.api.v1.endpoints.auth.get_settings",
        lambda: _settings_with_code(REGISTRATION_CODE),
    )

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "realprof@example.com",
            "password": "securepass123",
            "name": "Real Professor",
            "role": UserRole.PROFESSOR.value,
            "registration_code": REGISTRATION_CODE,
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["user"]["role"] == UserRole.PROFESSOR.value


@pytest.mark.asyncio
async def test_student_registration_unaffected_by_code(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Students are not a privileged role, so the code must not be required."""
    monkeypatch.setattr(
        "app.api.v1.endpoints.auth.get_settings",
        lambda: _settings_with_code(REGISTRATION_CODE),
    )

    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "student@example.com",
            "password": "securepass123",
            "name": "Student",
            "role": UserRole.STUDENT.value,
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["user"]["role"] == UserRole.STUDENT.value


@pytest.mark.asyncio
async def test_professor_registration_open_when_no_code_configured(
    client: AsyncClient,
) -> None:
    """Test/dev default: no code configured, so registration stays frictionless."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "devprof@example.com",
            "password": "securepass123",
            "name": "Dev Professor",
            "role": UserRole.PROFESSOR.value,
        },
    )

    assert response.status_code == 201, response.text


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rate_limiter_allows_requests_under_the_limit() -> None:
    limiter = RateLimiter("test-bucket", limit=3, window_seconds=60)
    redis = FakeRedis()
    request = _fake_request()

    for _ in range(3):
        assert await limiter(request, redis) is None  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_rate_limiter_rejects_once_over_the_limit() -> None:
    limiter = RateLimiter("test-bucket", limit=2, window_seconds=60)
    redis = FakeRedis()
    request = _fake_request()

    await limiter(request, redis)  # type: ignore[arg-type]
    await limiter(request, redis)  # type: ignore[arg-type]

    with pytest.raises(HTTPException) as exc_info:
        await limiter(request, redis)  # type: ignore[arg-type]

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers is not None
    assert exc_info.value.headers["Retry-After"] == "60"


@pytest.mark.asyncio
async def test_rate_limiter_tracks_clients_independently() -> None:
    limiter = RateLimiter("test-bucket", limit=1, window_seconds=60)
    redis = FakeRedis()

    await limiter(_fake_request(host="10.0.0.1"), redis)  # type: ignore[arg-type]
    # A different client still gets its own allowance.
    await limiter(_fake_request(host="10.0.0.2"), redis)  # type: ignore[arg-type]

    with pytest.raises(HTTPException):
        await limiter(_fake_request(host="10.0.0.1"), redis)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_rate_limiter_fails_open_when_redis_is_down() -> None:
    """A Redis outage must not take down registration or uploads."""

    class BrokenRedis:
        async def incr(self, key: str) -> int:
            raise ConnectionError("redis unavailable")

    limiter = RateLimiter("test-bucket", limit=1, window_seconds=60)
    assert await limiter(_fake_request(), BrokenRedis()) is None  # type: ignore[arg-type]


def test_client_key_prefers_forwarded_for() -> None:
    """Behind nginx/an ALB, request.client.host is the proxy for every caller."""
    request = _fake_request(host="10.0.0.9", forwarded="203.0.113.7, 70.41.3.18")
    assert _client_key(request) == "203.0.113.7"  # type: ignore[arg-type]


def test_client_key_falls_back_to_peer_address() -> None:
    assert _client_key(_fake_request(host="10.0.0.9")) == "10.0.0.9"  # type: ignore[arg-type]
