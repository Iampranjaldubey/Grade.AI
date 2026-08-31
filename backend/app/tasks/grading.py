"""
Celery tasks for document processing and grading.
"""

import uuid
from typing import TYPE_CHECKING

import structlog
from celery.exceptions import Retry

from app.celery_app import celery_app
from app.core.config import get_settings
from app.core.enums import ApprovalStatus, DocumentType, GradingMode, ParseStatus
from app.db.sync_session import get_sync_db
from app.infrastructure.chromadb_client import ChromaDBClient
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.rag.chunker import chunk_text
from app.rag.embeddings import get_embedding_service
from app.rag.parsers import parse_document
from app.services.s3_service import S3Service

if TYPE_CHECKING:
    from app.models.evaluation import Evaluation

logger = structlog.get_logger(__name__)

# How long evaluation waits for document parsing to finish before giving up.
# 5 attempts x 60s ~= 5 minutes.
PROCESSING_WAIT_SECONDS = 60
PROCESSING_WAIT_MAX_RETRIES = 5

# Reasons an evaluation must not be re-graded by AI, in priority order.
MANUAL_EVALUATION_EXISTS = "manual_evaluation_exists"
PROFESSOR_OVERRIDE_EXISTS = "professor_override_exists"
PROFESSOR_APPROVAL_EXISTS = "professor_approval_exists"


def human_decision_reason(evaluation: "Evaluation") -> str | None:
    """
    Return why AI grading must not touch this evaluation, or None if it is safe
    to (re-)grade.

    Shared by the Celery task and the trigger endpoint so both apply exactly the
    same rule. A system auto-approval (AUTO grading mode) leaves ``approved_by``
    NULL and is therefore still re-gradable; anything a professor decided is not.
    """
    if evaluation.ai_score is None:
        return MANUAL_EVALUATION_EXISTS
    if evaluation.approval_status == ApprovalStatus.OVERRIDDEN:
        return PROFESSOR_OVERRIDE_EXISTS
    if evaluation.approval_status == ApprovalStatus.APPROVED and evaluation.approved_by is not None:
        return PROFESSOR_APPROVAL_EXISTS
    return None


@celery_app.task(name="gradeai.evaluate_submission", bind=True, max_retries=3)
def evaluate_submission(self, submission_id: str) -> dict:
    """
    Evaluate a student submission using AI grading.

    Pipeline:
    1. Load submission and related data from database
    2. Check if document is fully processed
    3. Retrieve relevant context (rubrics, notes, samples)
    4. Call AI evaluator (Gemini) to grade
    5. Store evaluation results in database
    6. Update submission status

    Args:
        submission_id: UUID string of the submission

    Returns:
        Dict with evaluation results
    """
    from datetime import datetime
    from decimal import Decimal

    from app.core.config import get_settings
    from app.core.enums import ParseStatus, SubmissionStatus
    from app.db.sync_session import get_sync_db
    from app.infrastructure.chromadb_client import ChromaDBClient
    from app.models.assignment import Assignment
    from app.models.document import Document
    from app.models.evaluation import Evaluation
    from app.models.rubric import Rubric
    from app.models.submission import Submission
    from app.rag.evaluator import GradingEvaluator
    from app.rag.retrieval import RetrievalService

    settings = get_settings()
    logger.info("evaluate_submission_started", submission_id=submission_id)

    try:
        # Step 1: Load submission and related data
        with get_sync_db() as db:
            submission = (
                db.query(Submission).filter(Submission.id == uuid.UUID(submission_id)).first()
            )

            if not submission:
                logger.error("submission_not_found", submission_id=submission_id)
                raise ValueError(f"Submission {submission_id} not found")

            # Load assignment and rubrics
            assignment = (
                db.query(Assignment).filter(Assignment.id == submission.assignment_id).first()
            )

            if not assignment:
                raise ValueError(f"Assignment {submission.assignment_id} not found")

            rubrics = (
                db.query(Rubric)
                .filter(Rubric.assignment_id == assignment.id)
                .order_by(Rubric.created_at)
                .all()
            )

            if not rubrics:
                logger.warning("no_rubrics_found", assignment_id=str(assignment.id))
                raise ValueError("Cannot evaluate: no rubrics defined for this assignment")

            course_id = assignment.course_id

            # Step 2: Find the document for this submission
            # Submission creates a Document with doc_type=submission
            document = (
                db.query(Document)
                .filter(
                    Document.uploader_id == submission.student_id,
                    Document.assignment_id == assignment.id,
                    Document.doc_type == "submission",
                )
                .order_by(Document.created_at.desc())
                .first()
            )

            if not document:
                logger.error("submission_document_not_found", submission_id=submission_id)
                raise ValueError("Submission document not found")

            # Check if document is fully processed
            if document.parse_status != ParseStatus.SUCCESS:
                if document.parse_status == ParseStatus.FAILED:
                    raise ValueError("Document parsing failed. Cannot evaluate.")
                else:
                    # Parsing hasn't finished yet. Wait and re-check, up to
                    # PROCESSING_WAIT_MAX_RETRIES times (~5 minutes total).
                    logger.info(
                        "document_still_processing",
                        document_id=str(document.id),
                        attempt=self.request.retries + 1,
                    )
                    raise self.retry(
                        countdown=PROCESSING_WAIT_SECONDS,
                        max_retries=PROCESSING_WAIT_MAX_RETRIES,
                    )

            if not document.parsed_text:
                raise ValueError("Document has no parsed text")

            submission_text = document.parsed_text

            logger.info(
                "submission_loaded",
                submission_id=submission_id,
                assignment_id=str(assignment.id),
                course_id=str(course_id),
                text_length=len(submission_text),
            )

        # Step 3: Retrieve context
        chroma_client = ChromaDBClient(settings)
        chroma_client.connect()

        retrieval_service = RetrievalService(chroma_client, get_embedding_service())

        with get_sync_db() as db:
            retrieval_result = retrieval_service.retrieve_context(
                submission_text=submission_text,
                assignment_id=assignment.id,
                course_id=course_id,
                db_session=db,
            )

        logger.info(
            "context_retrieved",
            rubric_chunks=len(retrieval_result.rubric_chunks),
            notes_chunks=len(retrieval_result.notes_chunks),
            sample_chunks=len(retrieval_result.sample_chunks),
        )

        # Step 4: Evaluate with AI
        evaluator = GradingEvaluator(settings)

        evaluation_result = evaluator.evaluate(
            submission_text=submission_text,
            rubrics=rubrics,
            retrieval_result=retrieval_result,
            assignment=assignment,
        )

        logger.info(
            "ai_evaluation_completed",
            submission_id=submission_id,
            total_score=evaluation_result.total_score,
            confidence=evaluation_result.confidence_score,
        )

        # Step 5: Store evaluation in database
        with get_sync_db() as db:
            # Re-load assignment to access grading_mode
            assignment_obj = db.query(Assignment).filter(Assignment.id == assignment.id).first()
            if assignment_obj is None:
                # Assignment was deleted between the earlier load and this
                # re-fetch; nothing sensible to store the evaluation against.
                raise ValueError(f"Assignment {assignment.id} no longer exists")

            # Check if evaluation already exists
            existing_eval = (
                db.query(Evaluation)
                .filter(Evaluation.submission_id == uuid.UUID(submission_id))
                .first()
            )

            if existing_eval:
                # Never overwrite a grading decision a human already made.
                #
                # `ai_score is None` catches purely manual evaluations. The
                # approval checks additionally protect an AI grade that a
                # professor has since approved or overridden: those still carry
                # a non-null ai_score, so without this a re-trigger would
                # silently replace the professor's score and feedback (and, in
                # AUTO mode, re-approve the AI's number over the top).
                #
                # A system auto-approval leaves approved_by NULL, so AUTO-mode
                # grades that no human has touched remain re-gradable.
                skip_reason = human_decision_reason(existing_eval)
                if skip_reason is not None:
                    logger.warning(
                        "skipped_ai_overwrite_of_human_decision",
                        evaluation_id=str(existing_eval.id),
                        submission_id=submission_id,
                        reason=skip_reason,
                        approval_status=existing_eval.approval_status.value,
                    )
                    return {
                        "submission_id": submission_id,
                        "status": "skipped",
                        "reason": skip_reason,
                    }

                # Update existing evaluation
                existing_eval.ai_score = Decimal(str(evaluation_result.total_score))
                existing_eval.ai_feedback = {
                    "criteria_scores": evaluation_result.criteria_scores,
                    "percentage": evaluation_result.percentage,
                    "confidence_score": evaluation_result.confidence_score,
                    "is_fallback": evaluation_result.is_fallback,
                }
                existing_eval.strengths = evaluation_result.strengths
                existing_eval.weaknesses = evaluation_result.weaknesses
                existing_eval.missing_topics = evaluation_result.missing_topics
                existing_eval.retrieved_chunks = [
                    {
                        "chunk_text": chunk.chunk_text,
                        "document_id": chunk.document_id,
                        "doc_type": chunk.doc_type,
                        "relevance_score": chunk.relevance_score,
                        "source_name": chunk.source_name,
                    }
                    for chunk in (
                        retrieval_result.rubric_chunks
                        + retrieval_result.notes_chunks
                        + retrieval_result.sample_chunks
                    )
                ]
                existing_eval.evaluated_at = datetime.utcnow()

                # Auto-approve if grading mode is AUTO.
                # Never auto-approve a fallback evaluation (AI grading failed entirely,
                # placeholder 50% score) - it must be held for professor review.
                if (
                    assignment_obj.grading_mode == GradingMode.AUTO
                    and not evaluation_result.is_fallback
                ):
                    existing_eval.approval_status = ApprovalStatus.APPROVED
                    existing_eval.final_score = existing_eval.ai_score
                    existing_eval.approved_at = datetime.utcnow()
                    # approved_by left as NULL for system auto-approvals

                    logger.info(
                        "evaluation_auto_approved",
                        evaluation_id=str(existing_eval.id),
                        grading_mode=assignment_obj.grading_mode.value,
                    )
                elif (
                    assignment_obj.grading_mode == GradingMode.AUTO
                    and evaluation_result.is_fallback
                ):
                    # Held as pending despite AUTO mode; surfaces in the
                    # professor's pending review list.
                    existing_eval.approval_status = ApprovalStatus.PENDING
                    logger.warning(
                        "fallback_evaluation_held_for_review",
                        evaluation_id=str(existing_eval.id),
                        submission_id=submission_id,
                        grading_mode=assignment_obj.grading_mode.value,
                    )

                logger.info("evaluation_updated", evaluation_id=str(existing_eval.id))
            else:
                # Create new evaluation
                evaluation = Evaluation(
                    submission_id=uuid.UUID(submission_id),
                    ai_score=Decimal(str(evaluation_result.total_score)),
                    ai_feedback={
                        "criteria_scores": evaluation_result.criteria_scores,
                        "percentage": evaluation_result.percentage,
                        "confidence_score": evaluation_result.confidence_score,
                        "is_fallback": evaluation_result.is_fallback,
                    },
                    strengths=evaluation_result.strengths,
                    weaknesses=evaluation_result.weaknesses,
                    missing_topics=evaluation_result.missing_topics,
                    retrieved_chunks=[
                        {
                            "chunk_text": chunk.chunk_text,
                            "document_id": chunk.document_id,
                            "doc_type": chunk.doc_type,
                            "relevance_score": chunk.relevance_score,
                            "source_name": chunk.source_name,
                        }
                        for chunk in (
                            retrieval_result.rubric_chunks
                            + retrieval_result.notes_chunks
                            + retrieval_result.sample_chunks
                        )
                    ],
                    evaluated_at=datetime.utcnow(),
                )

                # Auto-approve if grading mode is AUTO.
                # Never auto-approve a fallback evaluation (AI grading failed entirely,
                # placeholder 50% score) - it must be held for professor review.
                auto_approved = (
                    assignment_obj.grading_mode == GradingMode.AUTO
                    and not evaluation_result.is_fallback
                )
                if auto_approved:
                    evaluation.approval_status = ApprovalStatus.APPROVED
                    evaluation.final_score = evaluation.ai_score
                    evaluation.approved_at = datetime.utcnow()
                    # approved_by left as NULL for system auto-approvals

                db.add(evaluation)
                db.flush()

                # Log after flush so we have evaluation.id
                if auto_approved:
                    logger.info(
                        "evaluation_auto_approved",
                        evaluation_id=str(evaluation.id),
                        grading_mode=assignment_obj.grading_mode.value,
                    )
                elif (
                    assignment_obj.grading_mode == GradingMode.AUTO
                    and evaluation_result.is_fallback
                ):
                    logger.warning(
                        "fallback_evaluation_held_for_review",
                        evaluation_id=str(evaluation.id),
                        submission_id=submission_id,
                        grading_mode=assignment_obj.grading_mode.value,
                    )

                logger.info("evaluation_created", evaluation_id=str(evaluation.id))

            # Step 6: Update submission status
            submission_obj = (
                db.query(Submission).filter(Submission.id == uuid.UUID(submission_id)).first()
            )
            if submission_obj is None:
                raise ValueError(f"Submission {submission_id} no longer exists")
            submission_obj.status = SubmissionStatus.EVALUATED

            db.commit()

        logger.info("evaluate_submission_completed", submission_id=submission_id)

        return {
            "submission_id": submission_id,
            "status": "evaluated",
            "total_score": evaluation_result.total_score,
            "confidence_score": evaluation_result.confidence_score,
        }

    except Retry:
        # celery.exceptions.Retry subclasses Exception, so without this it would
        # be captured by the handler below and re-raised with different options
        # — silently discarding the countdown and max_retries chosen above, and
        # logging a "failed" event for what is a normal wait.
        raise

    except Exception as exc:
        logger.error(
            "evaluate_submission_failed",
            submission_id=submission_id,
            error=str(exc),
            attempt=self.request.retries + 1,
        )

        # Retry with exponential backoff
        if self.request.retries < self.max_retries:
            countdown = 60 * (2**self.request.retries)  # 60s, 120s, 240s
            logger.info("retrying_evaluation", countdown=countdown)
            raise self.retry(exc=exc, countdown=countdown) from exc
        else:
            logger.error("max_retries_exceeded_evaluation", submission_id=submission_id)
            raise


@celery_app.task(name="gradeai.process_document", bind=True, max_retries=3)
def process_document(self, document_id: str) -> dict:
    """
    Process an uploaded document through the complete pipeline:
    1. Download from S3
    2. Extract text based on file type (PDF/DOCX/TXT)
    3. Chunk the text
    4. Generate embeddings
    5. Store chunks in database
    6. Store embeddings in ChromaDB
    7. Update document parse_status

    This task is idempotent and can be retried on failure.

    Args:
        document_id: UUID string of the document to process

    Returns:
        Dict with processing results

    Raises:
        Exception: If processing fails after max_retries
    """
    settings = get_settings()
    logger.info("process_document_started", document_id=document_id)

    try:
        # Step 1: Load document from database
        with get_sync_db() as db:
            document = db.query(Document).filter(Document.id == uuid.UUID(document_id)).first()

            if not document:
                logger.error("document_not_found", document_id=document_id)
                raise ValueError(f"Document {document_id} not found")

            # Update status to processing
            document.parse_status = ParseStatus.PROCESSING
            db.commit()

            # Extract file info
            file_key = document.file_key
            mime_type = document.mime_type
            course_id = document.course_id
            assignment_id = document.assignment_id
            doc_type = document.doc_type
            uploader_id = document.uploader_id

            logger.info(
                "document_loaded",
                document_id=document_id,
                file_key=file_key,
                mime_type=mime_type,
            )

        # Step 2: Download file from S3
        s3_service = S3Service(settings)

        # Get the file content directly from S3
        file_bytes = _download_from_s3(s3_service, file_key)

        logger.info("file_downloaded", document_id=document_id, size_bytes=len(file_bytes))

        # Step 3: Parse text from file
        try:
            extracted_text = parse_document(file_bytes, mime_type)
            logger.info("text_extracted", document_id=document_id, length=len(extracted_text))
        except ValueError as exc:
            logger.error("parsing_failed", document_id=document_id, error=str(exc))
            _update_document_status(document_id, ParseStatus.FAILED)
            raise

        if not extracted_text or len(extracted_text.strip()) < 10:
            logger.warning("text_too_short", document_id=document_id)
            _update_document_status(document_id, ParseStatus.FAILED)
            raise ValueError("Extracted text is empty or too short")

        # Step 4: Update document with parsed text
        # Sanitize text: Remove NULL bytes that PostgreSQL cannot store
        sanitized_text = extracted_text.replace("\x00", "")

        with get_sync_db() as db:
            document = db.query(Document).filter(Document.id == uuid.UUID(document_id)).first()
            if document is None:
                raise ValueError(f"Document {document_id} no longer exists")
            document.parsed_text = sanitized_text
            db.commit()

        # Step 5: Chunk the text (use sanitized text)
        chunks = chunk_text(sanitized_text, chunk_size=500, overlap=50)

        if not chunks:
            logger.warning("no_chunks_created", document_id=document_id)
            _update_document_status(document_id, ParseStatus.FAILED)
            raise ValueError("No chunks created from text")

        logger.info("text_chunked", document_id=document_id, num_chunks=len(chunks))

        # Step 6: Generate embeddings for all chunks
        chunk_texts = [chunk["text"] for chunk in chunks]
        embeddings = get_embedding_service().embed_texts(chunk_texts)

        logger.info("embeddings_generated", document_id=document_id, count=len(embeddings))

        # Step 7: Store chunks in database with embedding IDs
        chunk_records = []
        embedding_ids = []

        # Cleanup existing chunks if retry (makes insert idempotent)
        with get_sync_db() as db:
            existing_chunks = (
                db.query(DocumentChunk)
                .filter(DocumentChunk.document_id == uuid.UUID(document_id))
                .all()
            )

            if existing_chunks:
                existing_count = len(existing_chunks)
                logger.warning(
                    "retry_cleanup_existing_chunks",
                    document_id=document_id,
                    count=existing_count,
                )
                db.query(DocumentChunk).filter(
                    DocumentChunk.document_id == uuid.UUID(document_id)
                ).delete()
                db.commit()

        with get_sync_db() as db:
            for _i, chunk in enumerate(chunks):
                embedding_id = str(uuid.uuid4())

                chunk_record = DocumentChunk(
                    document_id=uuid.UUID(document_id),
                    chunk_index=chunk["chunk_index"],
                    chunk_text=chunk["text"],
                    token_count=chunk["token_count"],
                    embedding_id=embedding_id,
                    chunk_metadata={
                        "char_count": chunk["char_count"],
                    },
                )

                db.add(chunk_record)
                chunk_records.append(chunk_record)
                embedding_ids.append(embedding_id)

            db.commit()
            logger.info("chunks_stored_in_db", document_id=document_id, count=len(chunk_records))

        # Step 8: Store embeddings in ChromaDB
        chromadb_client = ChromaDBClient(settings)
        chromadb_client.connect()

        # Get or create collection for this course
        collection = chromadb_client.get_or_create_collection(course_id)

        # Cleanup existing ChromaDB entries if retry (makes add idempotent)
        try:
            chromadb_client.delete_document_chunks(collection.name, document_id)
            logger.info("chromadb_retry_cleanup", document_id=document_id)
        except Exception as cleanup_exc:
            # Ignore if no chunks existed to delete (not an error)
            logger.debug(
                "chromadb_cleanup_skipped",
                document_id=document_id,
                reason=str(cleanup_exc),
            )

        # Prepare metadata for each chunk
        metadatas = [
            {
                "document_id": document_id,
                "doc_type": str(doc_type),
                "course_id": str(course_id),
                "assignment_id": str(assignment_id) if assignment_id else "",
                "chunk_index": chunk["chunk_index"],
            }
            for chunk in chunks
        ]

        # Add chunks to ChromaDB
        chromadb_client.add_chunks(
            collection_name=collection.name,
            chunks=chunk_texts,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=embedding_ids,
        )

        logger.info("chunks_stored_in_chromadb", document_id=document_id, count=len(chunks))

        # Step 9: Update document status to SUCCESS
        _update_document_status(document_id, ParseStatus.SUCCESS)

        logger.info("process_document_completed", document_id=document_id, num_chunks=len(chunks))

        # Step 10: If this is a student submission, chain AI evaluation now that
        # parsing + embedding are actually complete. This replaces the API-side
        # fixed 15s countdown heuristic, so evaluation never races ahead of
        # processing (auto/hybrid only; manual mode is graded by the professor).
        if doc_type == DocumentType.SUBMISSION and assignment_id is not None:
            try:
                from app.models.assignment import Assignment
                from app.models.submission import Submission

                with get_sync_db() as db:
                    assignment_obj = (
                        db.query(Assignment).filter(Assignment.id == assignment_id).first()
                    )
                    submission = (
                        db.query(Submission)
                        .filter(
                            Submission.assignment_id == assignment_id,
                            Submission.student_id == uploader_id,
                        )
                        .order_by(Submission.submitted_at.desc())
                        .first()
                    )
                    grading_mode = assignment_obj.grading_mode if assignment_obj else None
                    submission_id = str(submission.id) if submission else None

                if submission_id and grading_mode in (GradingMode.AUTO, GradingMode.HYBRID):
                    evaluate_submission.delay(submission_id)
                    logger.info(
                        "chained_evaluation_after_processing",
                        submission_id=submission_id,
                        grading_mode=grading_mode.value,
                    )
            except Exception as chain_exc:
                # Chaining is best-effort; a failure here shouldn't fail the
                # document processing that already succeeded.
                logger.error(
                    "failed_to_chain_evaluation",
                    document_id=document_id,
                    error=str(chain_exc),
                )

        return {
            "document_id": document_id,
            "status": "success",
            "num_chunks": len(chunks),
            "text_length": len(extracted_text),
        }

    except Exception as exc:
        logger.error(
            "process_document_failed",
            document_id=document_id,
            error=str(exc),
            attempt=self.request.retries + 1,
        )

        # Update status to failed (don't let this mask the original exception)
        try:
            _update_document_status(document_id, ParseStatus.FAILED)
        except Exception as update_exc:
            logger.error(
                "retry_cleanup_failed",
                document_id=document_id,
                cleanup_error=str(update_exc),
                original_error=str(exc),
            )
            # Continue - will surface on next retry if DB truly unreachable

        # Retry with exponential backoff (always use ORIGINAL exception)
        if self.request.retries < self.max_retries:
            countdown = 30 * (2**self.request.retries)  # 30s, 60s, 120s
            logger.info("retrying_document_processing", countdown=countdown)
            raise self.retry(exc=exc, countdown=countdown) from exc
        else:
            logger.error("max_retries_exceeded", document_id=document_id)
            raise


def _download_from_s3(s3_service: S3Service, file_key: str) -> bytes:
    """
    Download file content from S3.

    Args:
        s3_service: S3Service instance
        file_key: S3 object key

    Returns:
        File content as bytes
    """
    try:
        response = s3_service._client.get_object(
            Bucket=s3_service.bucket,
            Key=file_key,
        )
        file_bytes = response["Body"].read()
        return file_bytes
    except Exception as exc:
        logger.error("s3_download_failed", file_key=file_key, error=str(exc))
        raise


def _update_document_status(document_id: str, status: ParseStatus) -> None:
    """
    Update document parse_status in database.

    Args:
        document_id: UUID string of the document
        status: New ParseStatus value
    """
    try:
        with get_sync_db() as db:
            document = db.query(Document).filter(Document.id == uuid.UUID(document_id)).first()
            if document:
                document.parse_status = status
                db.commit()
                logger.info("document_status_updated", document_id=document_id, status=status)
    except Exception as exc:
        logger.error("status_update_failed", document_id=document_id, error=str(exc))
        raise
