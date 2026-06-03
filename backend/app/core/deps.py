import uuid
from collections.abc import AsyncGenerator, Callable
from typing import Annotated

from celery import Celery
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery_app
from app.core.enums import UserRole
from app.core.security import decode_token
from app.db.session import get_db as _get_db
from app.infrastructure.redis_client import redis_manager
from app.models.user import User
from app.services.user_service import UserService

security_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(_get_db)]


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in _get_db():
        yield session


async def get_redis(request: Request) -> Redis:
    if request.app.state.settings.is_test:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis unavailable in test environment",
        )
    return redis_manager.client


def get_celery() -> Celery:
    return celery_app


def _extract_bearer_token(
    credentials: HTTPAuthorizationCredentials | None,
) -> str:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = _extract_bearer_token(credentials)
    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    subject = payload.get("sub")
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    service = UserService(db)
    user = await service.get_by_id(uuid.UUID(str(subject)))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    request.state.user_id = str(user.id)
    return user


def require_role(*roles: UserRole) -> Callable:
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles and not current_user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(r.value for r in roles)}",
            )
        return current_user

    return role_checker


async def get_current_professor(
    current_user: User = Depends(
        require_role(UserRole.PROFESSOR, UserRole.TA, UserRole.ADMIN),
    ),
) -> User:
    return current_user


async def get_current_student(
    current_user: User = Depends(require_role(UserRole.STUDENT, UserRole.ADMIN)),
) -> User:
    return current_user
