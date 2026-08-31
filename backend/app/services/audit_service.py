"""
Audit trail for consequential actions.

The ``audit_logs`` table has existed since the first migration but was never
written to, so grade decisions were only ever visible in log output — not
queryable, and lost with log retention. For a grading system, "who changed this
grade, when, and from what" needs to be durable.

Writes are best-effort: a failure here must never roll back or block the action
being recorded.
"""

import uuid
from typing import Any

import structlog
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

logger = structlog.get_logger(__name__)

# Action names. Keep these stable — they are queried.
ACTION_EVALUATION_APPROVED = "evaluation.approved"
ACTION_EVALUATION_OVERRIDDEN = "evaluation.overridden"
ACTION_EVALUATION_MANUAL_CREATED = "evaluation.manual_created"

ENTITY_EVALUATION = "evaluation"


def client_ip(request: Request | None) -> str | None:
    """
    Originating client IP, preferring X-Forwarded-For since the app runs behind
    nginx/an ALB where the peer address is the proxy.
    """
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return request.client.host[:45] if request.client else None


async def record_audit_log(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    """
    Append an audit entry to the current transaction.

    The caller is expected to commit; the entry then lands atomically with the
    change it describes. Any failure is swallowed and logged so auditing can
    never break the underlying operation.
    """
    try:
        db.add(
            AuditLog(
                user_id=user_id,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                old_value=old_value,
                new_value=new_value,
                ip_address=client_ip(request),
            )
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.error(
            "audit_log_write_failed",
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            error=str(exc),
        )
