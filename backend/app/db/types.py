from enum import StrEnum
from typing import TypeVar

from sqlalchemy import JSON, Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB

E = TypeVar("E", bound=StrEnum)

FlexibleJSON = JSON().with_variant(JSONB(), "postgresql")


def pg_enum(enum_cls: type[E], name: str, *, length: int = 50) -> SAEnum:
    """PostgreSQL-backed enum; uses VARCHAR + CHECK for SQLite test compatibility."""
    return SAEnum(
        enum_cls,
        name=name,
        values_callable=lambda members: [member.value for member in members],
        native_enum=False,
        length=length,
    )
