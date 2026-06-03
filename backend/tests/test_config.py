import pytest

from app.core.config import Settings, clear_settings_cache, get_settings
from app.core.enums import AppEnvironment


def test_cors_origins_parsed_from_string() -> None:
    settings = Settings(CORS_ORIGINS="https://a.test,https://b.test")
    assert settings.cors_origins == ["https://a.test", "https://b.test"]


def test_production_validation_rejects_default_jwt() -> None:
    settings = Settings(app_env=AppEnvironment.PRODUCTION, jwt_secret="change-me")
    with pytest.raises(ValueError, match="JWT_SECRET"):
        settings.validate_required()


def test_test_environment_skips_validation_in_get_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_settings_cache()
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("JWT_SECRET", "test")
    settings = get_settings()
    assert settings.app_env == AppEnvironment.TEST
    clear_settings_cache()
