import structlog

from app.celery_app import celery_app

logger = structlog.get_logger(__name__)


@celery_app.task(name="gradeai.process_submission", bind=True, max_retries=3)
def process_submission(self, submission_id: str) -> dict:
    logger.info("processing_submission", submission_id=submission_id)
    return {"submission_id": submission_id, "status": "processed"}
