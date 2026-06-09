import uuid

import pytest
from fastapi import HTTPException

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
