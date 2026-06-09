"""fix rubric weight precision

Revision ID: 003
Revises: 002
Create Date: 2026-06-08

"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.alter_column(
        "rubrics",
        "weight",
        type_=sa.Numeric(5, 2),
        existing_type=sa.Numeric(5, 4),
    )

def downgrade() -> None:
    op.alter_column(
        "rubrics",
        "weight",
        type_=sa.Numeric(5, 4),
        existing_type=sa.Numeric(5, 2),
    )