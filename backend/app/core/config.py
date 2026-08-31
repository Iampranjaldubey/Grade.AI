import json
from functools import lru_cache
from typing import Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.enums import AppEnvironment


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = "GradeAI"
    app_env: AppEnvironment = Field(default=AppEnvironment.DEVELOPMENT, alias="APP_ENV")
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    database_url: str = Field(
        default="postgresql+asyncpg://gradeai:gradeai@localhost:5432/gradeai",
        alias="DATABASE_URL",
    )
    database_url_sync: str = Field(
        default="postgresql://gradeai:gradeai@localhost:5432/gradeai",
        alias="DATABASE_URL_SYNC",
    )

    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    chromadb_host: str = Field(default="localhost", alias="CHROMADB_HOST")
    chromadb_port: int = Field(default=8001, alias="CHROMADB_PORT")

    # Shared secret required to self-register as a professor (or TA/admin).
    # Without this, anyone hitting the public /auth/register endpoint could
    # assign themselves the professor role and grade real submissions.
    # Required in production (see validate_required); left blank in
    # development/test so local setup and the test suite stay frictionless.
    professor_registration_code: str = Field(default="", alias="PROFESSOR_REGISTRATION_CODE")

    # Fixed-window rate limits (requests per window, per client IP).
    rate_limit_register_per_hour: int = Field(default=10, alias="RATE_LIMIT_REGISTER_PER_HOUR")
    rate_limit_presign_per_minute: int = Field(default=30, alias="RATE_LIMIT_PRESIGN_PER_MINUTE")

    jwt_secret: str = Field(default="change-me", alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    # Access tokens are short-lived; clients refresh via the refresh token. This
    # value is authoritative for the token's exp, the `expires_in` field, and the
    # logout blacklist TTL.
    access_token_expire_minutes: int = Field(default=15, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=7, alias="REFRESH_TOKEN_EXPIRE_DAYS")

    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.0-flash", alias="GEMINI_MODEL")

    # Hard ceiling on a single Gemini call. Without this the SDK can block
    # indefinitely, and because Celery runs with acks_late a hung call occupies
    # a worker slot forever instead of failing into the retry/fallback path.
    gemini_request_timeout_seconds: int = Field(default=120, alias="GEMINI_REQUEST_TIMEOUT_SECONDS")

    aws_s3_public_endpoint: str | None = Field(default=None, alias="AWS_S3_PUBLIC_ENDPOINT")
    aws_access_key_id: str = Field(default="", alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str = Field(default="", alias="AWS_SECRET_ACCESS_KEY")
    aws_region: str = Field(default="us-east-1", alias="AWS_REGION")
    aws_s3_bucket: str = Field(default="gradeai-uploads", alias="AWS_S3_BUCKET")
    aws_s3_endpoint: str | None = Field(default=None, alias="AWS_S3_ENDPOINT")
    aws_endpoint_url: str | None = Field(default=None, alias="AWS_ENDPOINT_URL")

    # Hard cap on uploaded file size (bytes). Enforced against the ACTUAL object
    # size in storage at confirm/submit time, not just the client-declared value.
    # Default 25 MiB. Guards Celery workers from OOM on oversized documents.
    max_upload_size_bytes: int = Field(default=26214400, alias="MAX_UPLOAD_SIZE_BYTES")

    celery_broker_url: str = Field(
        default="redis://localhost:6379/1",
        alias="CELERY_BROKER_URL",
    )
    celery_result_backend: str = Field(
        default="redis://localhost:6379/2",
        alias="CELERY_RESULT_BACKEND",
    )

    # Task time limits. The soft limit raises SoftTimeLimitExceeded inside the
    # task, so it is caught by the existing handlers and follows the normal
    # retry/fallback path; the hard limit kills a task that ignores it. Document
    # processing (download + parse + embed) is the slowest path, so the soft
    # limit is generous.
    celery_task_soft_time_limit: int = Field(default=600, alias="CELERY_TASK_SOFT_TIME_LIMIT")
    celery_task_time_limit: int = Field(default=660, alias="CELERY_TASK_TIME_LIMIT")

    # Stored as a raw comma-separated string, not list[str]. pydantic-settings
    # tries to JSON-decode any "complex" (list/dict) field sourced from an env
    # var BEFORE field validators run, so a real env var like
    # "http://a,http://b" (not JSON) raises SettingsError before
    # parse_cors_origins ever gets a chance to split it. A plain str field
    # sidesteps that decode step entirely; cors_origins below does the split.
    cors_origins_raw: str = Field(
        default="http://localhost:5173,http://localhost:3000",
        alias="CORS_ORIGINS",
        validation_alias="CORS_ORIGINS",
    )

    request_id_header: str = "X-Request-ID"

    @field_validator("app_env", mode="before")
    @classmethod
    def parse_app_env(cls, value: str | AppEnvironment) -> AppEnvironment:
        if isinstance(value, AppEnvironment):
            return value
        return AppEnvironment(str(value).lower())

    @property
    def cors_origins(self) -> list[str]:
        raw = self.cors_origins_raw.strip()
        # Accept a JSON array (e.g. '["http://a","http://b"]', as used in
        # backend/.env) as well as a plain comma-separated string (as used in
        # .env.example and docker-compose). Either way this runs after
        # construction, so it never hits pydantic-settings' env-var JSON
        # auto-decode step that raises on non-JSON input.
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(origin).strip() for origin in parsed if str(origin).strip()]
            except json.JSONDecodeError:
                pass
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @model_validator(mode="after")
    def apply_environment_defaults(self) -> Self:
        if self.is_test:
            object.__setattr__(self, "debug", False)
        elif self.is_development:
            object.__setattr__(self, "debug", True)
        return self

    @property
    def chromadb_url(self) -> str:
        return f"http://{self.chromadb_host}:{self.chromadb_port}"

    @property
    def is_development(self) -> bool:
        return self.app_env == AppEnvironment.DEVELOPMENT

    @property
    def is_production(self) -> bool:
        return self.app_env == AppEnvironment.PRODUCTION

    @property
    def is_test(self) -> bool:
        return self.app_env == AppEnvironment.TEST

    def validate_required(self) -> None:
        """Fail fast when mandatory configuration is missing or unsafe."""
        errors: list[str] = []

        if self.is_production:
            if not self.jwt_secret or self.jwt_secret == "change-me":
                errors.append("JWT_SECRET must be set to a secure value in production")
            if "localhost" in self.database_url and "asyncpg" in self.database_url:
                errors.append("DATABASE_URL must point to a production database")
            if not self.redis_url:
                errors.append("REDIS_URL is required in production")
            if not self.aws_s3_bucket:
                errors.append("AWS_S3_BUCKET is required in production")
            if not self.professor_registration_code:
                errors.append(
                    "PROFESSOR_REGISTRATION_CODE must be set in production, "
                    "otherwise anyone can self-register as a professor"
                )

        if (self.is_development or self.is_production) and not self.database_url:
            errors.append("DATABASE_URL is required")

        if errors:
            raise ValueError("Configuration validation failed:\n- " + "\n- ".join(errors))


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.app_env != AppEnvironment.TEST:
        settings.validate_required()
    return settings


def clear_settings_cache() -> None:
    get_settings.cache_clear()
