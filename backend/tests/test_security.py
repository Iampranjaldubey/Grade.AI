import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from app.core.config import get_settings
from app.core.deps import blacklist_ttl_seconds, refresh_ttl_seconds
from app.core.enums import UserRole
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("secret-password")
    assert verify_password("secret-password", hashed)
    assert not verify_password("wrong", hashed)


def test_access_token_roundtrip() -> None:
    user_id = uuid.uuid4()
    token = create_access_token(user_id, UserRole.STUDENT)
    payload = decode_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["type"] == "access"
    assert payload["role"] == UserRole.STUDENT.value
    assert "jti" in payload


def test_refresh_token_roundtrip() -> None:
    user_id = uuid.uuid4()
    token = create_refresh_token(user_id)
    payload = decode_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["type"] == "refresh"
    assert "jti" in payload


def test_decode_token_rejects_garbage() -> None:
    with pytest.raises(HTTPException) as exc_info:
        decode_token("not-a-valid-token")
    assert exc_info.value.status_code == 401


def test_access_token_expiry_honours_configuration() -> None:
    """
    The issuer previously hardcoded a 15-minute lifetime, so
    ACCESS_TOKEN_EXPIRE_MINUTES had no effect at all.
    """
    settings = get_settings()
    before = datetime.now(UTC)

    payload = decode_token(create_access_token(uuid.uuid4(), UserRole.STUDENT))

    expires_at = datetime.fromtimestamp(payload["exp"], tz=UTC)
    lifetime = expires_at - before
    expected = timedelta(minutes=settings.access_token_expire_minutes)
    # Allow a small window for execution time between the two clock reads.
    assert abs((lifetime - expected).total_seconds()) < 5


def test_refresh_token_expiry_honours_configuration() -> None:
    settings = get_settings()
    before = datetime.now(UTC)

    payload = decode_token(create_refresh_token(uuid.uuid4()))

    expires_at = datetime.fromtimestamp(payload["exp"], tz=UTC)
    lifetime = expires_at - before
    expected = timedelta(days=settings.refresh_token_expire_days)
    assert abs((lifetime - expected).total_seconds()) < 5


def test_blacklist_ttl_covers_full_access_token_lifetime() -> None:
    """
    A revoked access token must stay blacklisted for at least as long as it
    remains valid, or logout could be bypassed by waiting out the entry.
    """
    settings = get_settings()
    assert blacklist_ttl_seconds() >= settings.access_token_expire_minutes * 60


def test_refresh_allowlist_ttl_matches_token_lifetime() -> None:
    settings = get_settings()
    assert refresh_ttl_seconds() == settings.refresh_token_expire_days * 24 * 60 * 60
