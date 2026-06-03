from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()


@router.get(
    "",
    summary="List uploads",
    description="List file uploads associated with the current user.",
)
async def list_uploads(
    _user: User = Depends(get_current_user),
) -> list[dict[str, str]]:
    return []
