import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    BLACKLIST_TTL_SECONDS,
    REFRESH_TTL_SECONDS,
    get_current_user,
    get_db,
    get_redis,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.user import (
    LogoutRequest,
    MessageResponse,
    RefreshRequest,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserRead,
)

router = APIRouter()

LOCKOUT_TTL_SECONDS = 15 * 60
MAX_LOGIN_ATTEMPTS = 5
ACCESS_TOKEN_EXPIRES_IN = 900


async def _store_refresh_token(redis: Redis, refresh_token: str, user_id: uuid.UUID) -> None:
    payload = decode_token(refresh_token)
    jti = payload.get("jti")
    if not jti or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to issue refresh token",
        )
    await redis.set(f"refresh:{jti}", str(user_id), ex=REFRESH_TTL_SECONDS)


async def _revoke_refresh_token(redis: Redis, refresh_token: str) -> None:
    payload = decode_token(refresh_token)
    jti = payload.get("jti")
    if jti:
        await redis.delete(f"refresh:{jti}")


def _token_response(user: User, access_token: str, refresh_token: str) -> TokenResponse:
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRES_IN,
        user=UserRead.model_validate(user),
    )


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=payload.email,
        name=payload.name,
        role=payload.role,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)
    await _store_refresh_token(redis, refresh_token, user.id)

    return _token_response(user, access_token, refresh_token)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate and obtain JWT",
)
async def login(
    payload: UserLogin,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> TokenResponse:
    if await redis.exists(f"lockout:{payload.email}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts",
        )

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not verify_password(payload.password, user.password_hash):
        fails_key = f"fails:{payload.email}"
        attempts = await redis.incr(fails_key)
        if attempts == 1:
            await redis.expire(fails_key, LOCKOUT_TTL_SECONDS)
        if attempts >= MAX_LOGIN_ATTEMPTS:
            await redis.set(f"lockout:{payload.email}", "1", ex=LOCKOUT_TTL_SECONDS)
            await redis.delete(fails_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    await redis.delete(f"fails:{payload.email}")

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)
    await _store_refresh_token(redis, refresh_token, user.id)

    return _token_response(user, access_token, refresh_token)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
)
async def refresh_tokens(
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> TokenResponse:
    token_payload = decode_token(payload.refresh_token)
    if token_payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    jti = token_payload.get("jti")
    if not jti or not await redis.exists(f"refresh:{jti}"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    subject = token_payload.get("sub")
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    result = await db.execute(select(User).where(User.id == uuid.UUID(str(subject))))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    await redis.delete(f"refresh:{jti}")

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)
    await _store_refresh_token(redis, refresh_token, user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRES_IN,
        user=None,
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout and revoke tokens",
)
async def logout(
    payload: LogoutRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    access_jti = getattr(request.state, "access_jti", None)
    if access_jti:
        await redis.set(f"blacklist:{access_jti}", "1", ex=BLACKLIST_TTL_SECONDS)

    await _revoke_refresh_token(redis, payload.refresh_token)
    return MessageResponse(message="logged out")


@router.get(
    "/me",
    response_model=UserRead,
    summary="Current authenticated user",
)
async def get_me(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user)
