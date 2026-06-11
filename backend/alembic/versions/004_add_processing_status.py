"""add_processing_status

Revision ID: 004
Revises: 003
Create Date: 2026-06-09 12:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add 'processing' status to parse_status enum."""
    # PostgreSQL requires explicit enum alteration
    op.execute("""
        ALTER TYPE parse_status ADD VALUE IF NOT EXISTS 'processing';
    """)


def downgrade() -> None:
    """
    Downgrade not fully supported for enum values in PostgreSQL.
    Once an enum value is added, it cannot be easily removed.
    
    If you need to downgrade, you would need to:
    1. Change all 'processing' values to 'pending'
    2. Drop and recreate the enum type
    3. Recreate all columns using the enum
    
    This is not automated due to complexity and data safety.
    """
    pass
