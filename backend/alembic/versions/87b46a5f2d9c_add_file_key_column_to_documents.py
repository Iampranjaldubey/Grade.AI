"""add file_key column to documents

Revision ID: 87b46a5f2d9c
Revises: 004
Create Date: 2026-06-27 13:28:51.701364

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '87b46a5f2d9c'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'documents',
        sa.Column('file_key', sa.String(length=1024), server_default='', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('documents', 'file_key')