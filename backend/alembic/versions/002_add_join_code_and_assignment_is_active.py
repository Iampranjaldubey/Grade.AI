"""add join_code to courses and is_active to assignments

Revision ID: 002
Revises: 001
Create Date: 2026-06-07

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add join_code to courses (nullable first so existing rows are handled, then set NOT NULL)
    op.add_column(
        "courses",
        sa.Column("join_code", sa.String(length=8), nullable=True),
    )
    # Back-fill existing rows with a generated code before setting NOT NULL
    op.execute(
        """
        UPDATE courses
        SET join_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6))
        WHERE join_code IS NULL;
        """
    )
    op.alter_column("courses", "join_code", nullable=False)
    op.create_unique_constraint("uq_courses_join_code", "courses", ["join_code"])
    op.create_index("ix_courses_join_code", "courses", ["join_code"], unique=True)

    # Add is_active to assignments
    op.add_column(
        "assignments",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("assignments", "is_active")
    op.drop_index("ix_courses_join_code", table_name="courses")
    op.drop_constraint("uq_courses_join_code", "courses", type_="unique")
    op.drop_column("courses", "join_code")
