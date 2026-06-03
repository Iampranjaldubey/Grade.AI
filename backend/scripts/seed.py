import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.config import get_settings
from app.core.enums import UserRole
from app.core.security import get_password_hash
from app.db.session import close_db_pool, get_session_factory, init_db_pool
from app.models.user import User


async def seed() -> None:
    settings = get_settings()
    await init_db_pool(settings)

    async with get_session_factory()() as session:
        result = await session.execute(
            select(User).where(User.email == "admin@gradeai.local")
        )
        if result.scalar_one_or_none() is not None:
            print("Seed data already exists, skipping.")
            return

        admin = User(
            email="admin@gradeai.local",
            name="GradeAI Admin",
            password_hash=get_password_hash("changeme123"),
            role=UserRole.ADMIN,
        )
        session.add(admin)
        await session.commit()
        print("Seeded admin user: admin@gradeai.local / changeme123")

    await close_db_pool()


if __name__ == "__main__":
    asyncio.run(seed())
