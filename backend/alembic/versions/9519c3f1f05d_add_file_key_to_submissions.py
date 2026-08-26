"""add file_key to submissions

Revision ID: 9519c3f1f05d
Revises: bd4d6fde68e4
Create Date: 2026-08-27 02:43:32.525856

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9519c3f1f05d'
down_revision: Union[str, None] = 'bd4d6fde68e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable so existing rows don't need a backfill; new submissions populate it.
    op.add_column(
        "submissions",
        sa.Column("file_key", sa.String(length=1024), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("submissions", "file_key")
