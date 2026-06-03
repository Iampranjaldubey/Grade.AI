import uuid

from app.core.security import create_access_token, decode_token, get_password_hash, verify_password


def test_password_hash_roundtrip() -> None:
    hashed = get_password_hash("secret-password")
    assert verify_password("secret-password", hashed)
    assert not verify_password("wrong", hashed)


def test_access_token_roundtrip() -> None:
    user_id = uuid.uuid4()
    token = create_access_token(user_id)
    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == str(user_id)
    assert payload["type"] == "access"
