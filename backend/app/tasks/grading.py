"""
Celery tasks for document processing and grading.
"""
import uuid
from typing import Any

import structlog

from app.celery_app import celery_app
from app.core.config import get_settings
from app.core.enums import ParseStatus
from app.db.sync_session import get_sync_db
from app.infrastructure.chromadb_client import ChromaDBClient
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.rag.chunker import chunk_text
from app.rag.embeddings import embedding_service
from app.rag.parsers import parse_document
from app.services.s3_service import S3Service

logger = structlog.get_logger(__name__)


@celery_app.task(name="gradeai.process_submission", bind=True, max_retries=3)
def process_submission(self, submission_id: str) -> dict:
    logger.info("processing_submission", submission_id=submission_id)
    return {"submission_id": submission_id, "status": "processed"}


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
    from app.rag.embeddings import embedding_service
    from app.rag.evaluator import GradingEvaluator
    from app.rag.retrieval import RetrievalService
    
    settings = get_settings()
    logger.info("evaluate_submission_started", submission_id=submission_id)
    
    try:
        # Step 1: Load submission and related data
        with get_sync_db() as db:
            submission = db.query(Submission).filter(
                Submission.id == uuid.UUID(submission_id)
            ).first()
            
            if not submission:
                logger.error("submission_not_found", submission_id=submission_id)
                raise ValueError(f"Submission {submission_id} not found")
            
            # Load assignment and rubrics
            assignment = db.query(Assignment).filter(
                Assignment.id == submission.assignment_id
            ).first()
            
            if not assignment:
                raise ValueError(f"Assignment {submission.assignment_id} not found")
            
            rubrics = db.query(Rubric).filter(
                Rubric.assignment_id == assignment.id
            ).order_by(Rubric.created_at).all()
            
            if not rubrics:
                logger.warning("no_rubrics_found", assignment_id=str(assignment.id))
                raise ValueError("Cannot evaluate: no rubrics defined for this assignment")
            
            course_id = assignment.course_id
            
            # Step 2: Find the document for this submission
            # Submission creates a Document with doc_type=submission
            document = db.query(Document).filter(
                Document.uploader_id == submission.student_id,
                Document.assignment_id == assignment.id,
                Document.doc_type == "submission",
            ).order_by(Document.created_at.desc()).first()
            
            if not document:
                logger.error("submission_document_not_found", submission_id=submission_id)
                raise ValueError("Submission document not found")
            
            # Check if document is fully processed
            if document.parse_status != ParseStatus.SUCCESS:
                if document.parse_status == ParseStatus.FAILED:
                    raise ValueError("Document parsing failed. Cannot evaluate.")
                else:
                    # Still processing - retry after 60s
                    logger.info("document_still_processing", document_id=str(document.id))
                    raise self.retry(countdown=60, max_retries=5)
            
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
        
        retrieval_service = RetrievalService(chroma_client, embedding_service)
        
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
            # Check if evaluation already exists
            existing_eval = db.query(Evaluation).filter(
                Evaluation.submission_id == uuid.UUID(submission_id)
            ).first()
            
            if existing_eval:
                # Update existing evaluation
                existing_eval.ai_score = Decimal(str(evaluation_result.total_score))
                existing_eval.ai_feedback = {
                    "criteria_scores": evaluation_result.criteria_scores,
                    "percentage": evaluation_result.percentage,
                    "confidence_score": evaluation_result.confidence_score,
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
                        retrieval_result.rubric_chunks +
                        retrieval_result.notes_chunks +
                        retrieval_result.sample_chunks
                    )
                ]
                existing_eval.evaluated_at = datetime.utcnow()
                
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
                            retrieval_result.rubric_chunks +
                            retrieval_result.notes_chunks +
                            retrieval_result.sample_chunks
                        )
                    ],
                    evaluated_at=datetime.utcnow(),
                )
                
                db.add(evaluation)
                db.flush()
                
                logger.info("evaluation_created", evaluation_id=str(evaluation.id))
            
            # Step 6: Update submission status
            submission = db.query(Submission).filter(
                Submission.id == uuid.UUID(submission_id)
            ).first()
            submission.status = SubmissionStatus.EVALUATED
            
            db.commit()
        
        logger.info("evaluate_submission_completed", submission_id=submission_id)
        
        return {
            "submission_id": submission_id,
            "status": "evaluated",
            "total_score": evaluation_result.total_score,
            "confidence_score": evaluation_result.confidence_score,
        }
        
    except Exception as exc:
        logger.error(
            "evaluate_submission_failed",
            submission_id=submission_id,
            error=str(exc),
            attempt=self.request.retries + 1,
        )
        
        # Retry with exponential backoff
        if self.request.retries < self.max_retries:
            countdown = 60 * (2 ** self.request.retries)  # 60s, 120s, 240s
            logger.info("retrying_evaluation", countdown=countdown)
            raise self.retry(exc=exc, countdown=countdown)
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
            file_key = _extract_file_key_from_url(document.file_url)
            mime_type = document.mime_type
            course_id = document.course_id
            assignment_id = document.assignment_id
            doc_type = document.doc_type
            
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
        with get_sync_db() as db:
            document = db.query(Document).filter(Document.id == uuid.UUID(document_id)).first()
            document.parsed_text = extracted_text
            db.commit()
        
        # Step 5: Chunk the text
        chunks = chunk_text(extracted_text, chunk_size=500, overlap=50)
        
        if not chunks:
            logger.warning("no_chunks_created", document_id=document_id)
            _update_document_status(document_id, ParseStatus.FAILED)
            raise ValueError("No chunks created from text")
        
        logger.info("text_chunked", document_id=document_id, num_chunks=len(chunks))
        
        # Step 6: Generate embeddings for all chunks
        chunk_texts = [chunk["text"] for chunk in chunks]
        embeddings = embedding_service.embed_texts(chunk_texts)
        
        logger.info("embeddings_generated", document_id=document_id, count=len(embeddings))
        
        # Step 7: Store chunks in database with embedding IDs
        chunk_records = []
        embedding_ids = []
        
        with get_sync_db() as db:
            for i, chunk in enumerate(chunks):
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
        
        # Update status to failed
        try:
            _update_document_status(document_id, ParseStatus.FAILED)
        except Exception as update_exc:
            logger.error("failed_to_update_status", error=str(update_exc))
        
        # Retry with exponential backoff
        if self.request.retries < self.max_retries:
            countdown = 30 * (2 ** self.request.retries)  # 30s, 60s, 120s
            logger.info("retrying_document_processing", countdown=countdown)
            raise self.retry(exc=exc, countdown=countdown)
        else:
            logger.error("max_retries_exceeded", document_id=document_id)
            raise


def _extract_file_key_from_url(file_url: str) -> str:
    """
    Extract S3 file key from presigned URL or file URL.
    
    Args:
        file_url: Full S3 URL (presigned or direct)
        
    Returns:
        File key (path within bucket)
    """
    # Remove query parameters (presigned URL params)
    if "?" in file_url:
        file_url = file_url.split("?")[0]
    
    # Extract path after bucket name
    # Format: http://minio:9000/bucket-name/file/key/path.pdf
    parts = file_url.split("/")
    
    # Find bucket name and get everything after it
    try:
        # Typically: ['http:', '', 'minio:9000', 'bucket-name', 'file', 'key', ...]
        bucket_index = 3  # Index of bucket name
        file_key = "/".join(parts[bucket_index + 1:])
        return file_key
    except IndexError:
        logger.error("failed_to_extract_file_key", url=file_url)
        raise ValueError(f"Invalid file URL format: {file_url}")


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
        file_bytes = response['Body'].read()
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
