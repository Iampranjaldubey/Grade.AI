from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "gradeai",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.grading"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Bound every task. With acks_late and a prefetch of 1, a task that hangs
    # (most likely a stalled LLM or S3 call) would otherwise hold its worker
    # slot indefinitely. The soft limit raises inside the task so it follows the
    # normal retry path; the hard limit kills anything that ignores it.
    task_soft_time_limit=settings.celery_task_soft_time_limit,
    task_time_limit=settings.celery_task_time_limit,
)
