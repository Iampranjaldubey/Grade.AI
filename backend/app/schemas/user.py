import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.enums import UserRole


class UserBase(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    role: UserRole = UserRole.STUDENT


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)
    # Required only when registering into a privileged role (professor/TA/admin)
    # and only when the server has a code configured. See PROFESSOR_REGISTRATION_CODE.
    registration_code: str | None = Field(default=None, max_length=256)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class MessageResponse(BaseModel):
    message: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 900
    user: UserRead | None = None
