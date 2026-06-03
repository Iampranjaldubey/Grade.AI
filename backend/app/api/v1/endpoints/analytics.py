from fastapi import APIRouter, Depends

from app.core.deps import get_current_professor
from app.models.user import User

router = APIRouter()


@router.get(
    "",
    summary="Analytics overview",
    description="Aggregated grading analytics for professor dashboards.",
)
async def analytics_overview(
    _professor: User = Depends(get_current_professor),
) -> dict[str, str | int]:
    return {"submissions_graded": 0, "average_score": 0}
