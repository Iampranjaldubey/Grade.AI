"""
ChromaDB client for vector storage and retrieval.
Provides both async (for FastAPI endpoints) and sync (for Celery tasks) interfaces.
"""
import uuid
from typing import List, Dict, Any, Optional

import chromadb
from chromadb.config import Settings as ChromaSettings
import httpx
import structlog

from app.core.config import Settings

logger = structlog.get_logger(__name__)


class ChromaDBClient:
    """
    Wrapper around ChromaDB HTTP client with sync methods for Celery compatibility.
    """
    
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._base_url = settings.chromadb_url
        self._http: httpx.AsyncClient | None = None
        self._client: chromadb.HttpClient | None = None
    
    @property
    def http(self) -> httpx.AsyncClient:
        """Async HTTP client for health checks."""
        if self._http is None:
            self._http = httpx.AsyncClient(base_url=self._base_url, timeout=10.0)
        return self._http
    
    @property
    def client(self) -> chromadb.HttpClient:
        """Synchronous ChromaDB client for Celery tasks."""
        if self._client is None:
            self.connect()
        return self._client
    
    def connect(self) -> None:
        """Initialize synchronous ChromaDB HTTP client."""
        try:
            self._client = chromadb.HttpClient(
                host=self._settings.chromadb_host,
                port=self._settings.chromadb_port,
                settings=ChromaSettings(
                    anonymized_telemetry=False,
                ),
            )
            logger.info(
                "chromadb_connected",
                host=self._settings.chromadb_host,
                port=self._settings.chromadb_port,
            )
        except Exception as exc:
            logger.error("chromadb_connection_failed", error=str(exc))
            raise

    async def ping(self) -> bool:
        """Async health check for ChromaDB."""
        try:
            response = await self.http.get("/api/v1/heartbeat")
            return response.status_code == 200
        except httpx.HTTPError as exc:
            logger.warning("chromadb_ping_failed", error=str(exc))
            return False

    async def close(self) -> None:
        """Close async HTTP client."""
        if self._http is not None:
            await self._http.aclose()
            self._http = None
        logger.info("chromadb_disconnected")
    
    def get_or_create_collection(self, course_id: uuid.UUID) -> chromadb.Collection:
        """
        Get or create a collection for a specific course.
        Collection name format: gradeai_{course_id}
        
        Args:
            course_id: UUID of the course
            
        Returns:
            ChromaDB Collection object
        """
        collection_name = f"gradeai_{str(course_id)}"
        
        try:
            collection = self.client.get_or_create_collection(
                name=collection_name,
                metadata={"course_id": str(course_id)},
            )
            logger.info("chromadb_collection_ready", collection=collection_name)
            return collection
        except Exception as exc:
            logger.error(
                "chromadb_collection_creation_failed",
                collection=collection_name,
                error=str(exc),
            )
            raise
    
    def collection_exists(self, collection_name: str) -> bool:
        """
        Check if a collection exists.
        
        Args:
            collection_name: Name of the collection
            
        Returns:
            True if collection exists, False otherwise
        """
        try:
            collections = self.client.list_collections()
            return any(col.name == collection_name for col in collections)
        except Exception as exc:
            logger.error("chromadb_collection_check_failed", error=str(exc))
            return False
    
    def add_chunks(
        self,
        collection_name: str,
        chunks: List[str],
        embeddings: List[List[float]],
        metadatas: List[Dict[str, Any]],
        ids: List[str],
    ) -> None:
        """
        Add document chunks with embeddings to a collection.
        
        Args:
            collection_name: Name of the collection
            chunks: List of text chunks
            embeddings: List of embedding vectors
            metadatas: List of metadata dicts
            ids: List of unique IDs for each chunk
            
        Raises:
            ValueError: If list lengths don't match
        """
        if not all(len(chunks) == len(x) for x in [embeddings, metadatas, ids]):
            raise ValueError("All input lists must have the same length")
        
        if not chunks:
            logger.warning("add_chunks_empty_input")
            return
        
        try:
            collection = self.client.get_collection(name=collection_name)
            
            collection.add(
                documents=chunks,
                embeddings=embeddings,
                metadatas=metadatas,
                ids=ids,
            )
            
            logger.info(
                "chromadb_chunks_added",
                collection=collection_name,
                count=len(chunks),
            )
            
        except Exception as exc:
            logger.error(
                "chromadb_add_chunks_failed",
                collection=collection_name,
                error=str(exc),
            )
            raise
    
    def query(
        self,
        collection_name: str,
        query_embedding: List[float],
        n_results: int = 5,
        where_filter: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Query collection for similar chunks.
        
        Args:
            collection_name: Name of the collection to query
            query_embedding: Embedding vector for the query
            n_results: Number of results to return (default: 5)
            where_filter: Optional metadata filter (e.g., {"document_id": "123"})
            
        Returns:
            List of result dicts with keys: id, document, metadata, distance
            
        Example:
            >>> results = client.query(
            ...     "gradeai_course123",
            ...     query_embedding,
            ...     n_results=3,
            ...     where_filter={"doc_type": "rubric"}
            ... )
        """
        try:
            collection = self.client.get_collection(name=collection_name)
            
            query_kwargs = {
                "query_embeddings": [query_embedding],
                "n_results": n_results,
            }
            
            if where_filter:
                query_kwargs["where"] = where_filter
            
            results = collection.query(**query_kwargs)
            
            # Format results
            formatted_results = []
            if results and results['ids'] and results['ids'][0]:
                for i in range(len(results['ids'][0])):
                    formatted_results.append({
                        "id": results['ids'][0][i],
                        "document": results['documents'][0][i] if results.get('documents') else "",
                        "metadata": results['metadatas'][0][i] if results.get('metadatas') else {},
                        "distance": results['distances'][0][i] if results.get('distances') else 0.0,
                    })
            
            logger.info(
                "chromadb_query_executed",
                collection=collection_name,
                results_count=len(formatted_results),
            )
            
            return formatted_results
            
        except Exception as exc:
            logger.error(
                "chromadb_query_failed",
                collection=collection_name,
                error=str(exc),
            )
            raise
    
    def delete_document_chunks(self, collection_name: str, document_id: str) -> None:
        """
        Delete all chunks for a specific document.
        
        Args:
            collection_name: Name of the collection
            document_id: ID of the document whose chunks should be deleted
        """
        try:
            collection = self.client.get_collection(name=collection_name)
            
            # Delete all chunks with matching document_id in metadata
            collection.delete(
                where={"document_id": document_id}
            )
            
            logger.info(
                "chromadb_chunks_deleted",
                collection=collection_name,
                document_id=document_id,
            )
            
        except Exception as exc:
            logger.error(
                "chromadb_delete_chunks_failed",
                collection=collection_name,
                document_id=document_id,
                error=str(exc),
            )
            raise


def get_chromadb_client(settings: Settings) -> ChromaDBClient:
    """Dependency for FastAPI endpoints."""
    return ChromaDBClient(settings)
