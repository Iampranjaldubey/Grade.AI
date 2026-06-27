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

    jwt_secret: str = Field(default="change-me", alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=30, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=7, alias="REFRESH_TOKEN_EXPIRE_DAYS")

    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    gemini_model: str = Field(default="gemini-2.0-flash", alias="GEMINI_MODEL")
    
    aws_s3_public_endpoint: str | None = Field(default=None, alias="AWS_S3_PUBLIC_ENDPOINT")
    aws_access_key_id: str = Field(default="", alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str = Field(default="", alias="AWS_SECRET_ACCESS_KEY")
    aws_region: str = Field(default="us-east-1", alias="AWS_REGION")
    aws_s3_bucket: str = Field(default="gradeai-uploads", alias="AWS_S3_BUCKET")
    aws_s3_endpoint: str | None = Field(default=None, alias="AWS_S3_ENDPOINT")
    aws_endpoint_url: str | None = Field(default=None, alias="AWS_ENDPOINT_URL")

    celery_broker_url: str = Field(
        default="redis://localhost:6379/1",
        alias="CELERY_BROKER_URL",
    )
    celery_result_backend: str = Field(
        default="redis://localhost:6379/2",
        alias="CELERY_RESULT_BACKEND",
    )

    cors_origins: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"],
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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

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

        if self.is_development or self.is_production:
            if not self.database_url:
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
