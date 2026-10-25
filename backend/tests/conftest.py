import asyncio
import os
from collections.abc import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

# Force an isolated test configuration. These are assigned unconditionally (not
# setdefault) because inside docker-compose the backend container already has
# DATABASE_URL, REDIS_URL, GEMINI_API_KEY, etc. pointing at the *dev* services,
# and pydantic-settings would also pick them up from backend/.env. With
# setdefault the suite silently ran against the dev Postgres and left test users
# behind. Real environment variables take precedence over the .env file, so
# setting them here wins over both.
#
# External services point at a closed local port so any accidental real call
# fails fast instead of touching dev data. Set TEST_DATABASE_URL to run the
# suite against a dedicated (disposable) database instead of in-memory SQLite.
_UNREACHABLE = "127.0.0.1:1"
_TEST_ENV = {
    "APP_ENV": "test",
    "DATABASE_URL": os.environ.get("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:"),
    "DATABASE_URL_SYNC": os.environ.get("TEST_DATABASE_URL_SYNC", "sqlite:///:memory:"),
    "JWT_SECRET": "test-secret-key-for-unit-tests",
    "REDIS_URL": f"redis://{_UNREACHABLE}/0",
    # In-memory broker: a task dispatched by mistake is dropped, never handed
    # to the dev Celery worker (which would act on the dev database).
    "CELERY_BROKER_URL": "memory://",
    "CELERY_RESULT_BACKEND": "cache+memory://",
    "CHROMADB_HOST": "127.0.0.1",
    "CHROMADB_PORT": "1",
    "AWS_S3_ENDPOINT": f"http://{_UNREACHABLE}",
    "AWS_ENDPOINT_URL": f"http://{_UNREACHABLE}",
    "AWS_S3_PUBLIC_ENDPOINT": f"http://{_UNREACHABLE}",
    "AWS_ACCESS_KEY_ID": "test",
    "AWS_SECRET_ACCESS_KEY": "test",
    # Never spend real LLM quota from the test suite.
    "GEMINI_API_KEY": "",
    "PROFESSOR_REGISTRATION_CODE": "",
}
os.environ.update(_TEST_ENV)

# App imports must come after the environment is set: app modules read settings
# (and celery_app builds its broker connection) at import time.
from app.core.config import clear_settings_cache, get_settings  # noqa: E402
from app.core.deps import get_db, get_redis  # noqa: E402
from app.db.session import Base, close_db_pool, get_session_factory, init_db_pool  # noqa: E402
from app.main import create_app  # noqa: E402
from tests.fake_redis import FakeRedis  # noqa: E402

clear_settings_cache()

fake_redis = FakeRedis()


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    clear_settings_cache()
    settings = get_settings()
    await init_db_pool(settings)

    from app.db.session import get_engine

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with get_session_factory()() as session:
        yield session

    await close_db_pool()
    clear_settings_cache()


@pytest_asyncio.fixture(autouse=True)
async def clear_fake_redis() -> AsyncGenerator[None, None]:
    fake_redis._data.clear()
    yield
    fake_redis._data.clear()


@pytest.fixture(autouse=True)
def _no_s3_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    S3Service.__init__ calls head_bucket on construction, which is a real network
    round trip. Presigned URL generation is pure local signing, so tests can use a
    real S3Service once that check is disabled. Tests that need specific S3
    behaviour still patch get_s3_service / S3Service themselves.
    """
    from app.services.s3_service import S3Service

    monkeypatch.setattr(S3Service, "_ensure_bucket_exists", lambda self: None)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    clear_settings_cache()
    application = create_app()

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        try:
            yield db_session
            await db_session.commit()
        except Exception:
            await db_session.rollback()
            raise

    async def override_get_redis() -> FakeRedis:
        return fake_redis

    application.dependency_overrides[get_db] = override_get_db
    application.dependency_overrides[get_redis] = override_get_redis

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    application.dependency_overrides.clear()
    clear_settings_cache()


@pytest.fixture
def settings():
    clear_settings_cache()
    return get_settings()
