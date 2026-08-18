"""make ai_score nullable for manual evaluations

Revision ID: bd4d6fde68e4
Revises: 87b46a5f2d9c
Create Date: 2026-08-15 14:21:18.517342

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'bd4d6fde68e4'
down_revision: Union[str, None] = '87b46a5f2d9c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make ai_score nullable to support manual evaluations
    op.alter_column(
        'evaluations',
        'ai_score',
        existing_type=sa.Numeric(precision=10, scale=2),
        nullable=True,
        existing_nullable=False,
    )


def downgrade() -> None:
    # Revert ai_score to NOT NULL
    # WARNING: This will fail if any NULL values exist in ai_score column
    op.alter_column(
        'evaluations',
        'ai_score',
        existing_type=sa.Numeric(precision=10, scale=2),
        nullable=False,
        existing_nullable=True,
    )
