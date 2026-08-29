import pytest

from app.core.config import Settings, clear_settings_cache, get_settings
from app.core.enums import AppEnvironment


def test_cors_origins_parsed_from_string() -> None:
    settings = Settings(CORS_ORIGINS="https://a.test,https://b.test")
    assert settings.cors_origins == ["https://a.test", "https://b.test"]


def test_cors_origins_parsed_from_comma_separated_env_var(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Regression: a real env var (not an init kwarg) previously crashed with
    # SettingsError because pydantic-settings tried to JSON-decode a list[str]
    # field before validators ran. cors_origins_raw is a plain str now.
    clear_settings_cache()
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
    monkeypatch.setenv("JWT_SECRET", "test")
    monkeypatch.setenv("APP_ENV", "test")
    settings = Settings()
    assert settings.cors_origins == [
        "http://localhost:3000",
        "http://localhost:5173",
    ]
    clear_settings_cache()


def test_cors_origins_parsed_from_json_array_env_var(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # backend/.env ships CORS_ORIGINS as a JSON array; that form must also work.
    clear_settings_cache()
    monkeypatch.setenv("CORS_ORIGINS", '["http://a.test","http://b.test"]')
    monkeypatch.setenv("JWT_SECRET", "test")
    monkeypatch.setenv("APP_ENV", "test")
    settings = Settings()
    assert settings.cors_origins == ["http://a.test", "http://b.test"]
    clear_settings_cache()


def test_production_validation_rejects_default_jwt() -> None:
    settings = Settings(APP_ENV=AppEnvironment.PRODUCTION, JWT_SECRET="change-me")
    with pytest.raises(ValueError, match="JWT_SECRET"):
        settings.validate_required()


def test_test_environment_skips_validation_in_get_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_settings_cache()
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("JWT_SECRET", "test")
    settings = get_settings()
    assert settings.app_env == AppEnvironment.TEST
    clear_settings_cache()
