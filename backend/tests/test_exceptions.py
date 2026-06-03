from app.core.exceptions import AppException


def test_app_exception_fields() -> None:
    exc = AppException("not allowed", status_code=403, code="forbidden", details={"id": "1"})
    assert exc.message == "not allowed"
    assert exc.status_code == 403
    assert exc.code == "forbidden"
    assert exc.details["id"] == "1"
