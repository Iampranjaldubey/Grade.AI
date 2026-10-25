"""
Guards against the test suite reaching real services.

conftest.py used to apply its test configuration with os.environ.setdefault, so
inside docker-compose (where DATABASE_URL etc. already point at the dev stack)
the suite silently ran against the dev Postgres and left test users behind.
"""

from app.core.config import get_settings


def test_suite_uses_isolated_configuration() -> None:
    settings = get_settings()

    assert settings.is_test
    assert "postgres:5432" not in settings.database_url
    assert settings.database_url.startswith("sqlite") or "test" in settings.database_url
    assert settings.celery_broker_url == "memory://"
    assert settings.gemini_api_key == ""
    assert "minio" not in (settings.aws_endpoint_url or "")
    assert settings.chromadb_host != "chromadb"
