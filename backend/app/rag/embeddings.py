"""
Text embedding generation using sentence-transformers.
Uses local model (no API key needed).
"""
import structlog
from typing import List
from sentence_transformers import SentenceTransformer

logger = structlog.get_logger(__name__)


class EmbeddingService:
    """
    Service for generating text embeddings using sentence-transformers.
    Uses 'all-MiniLM-L6-v2' model which is:
    - Small and fast (~80MB)
    - Runs on CPU
    - Good quality for semantic search
    - No API key needed
    """
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        Initialize embedding service with specified model.
        
        Args:
            model_name: Hugging Face model name (default: all-MiniLM-L6-v2)
        """
        logger.info("loading_embedding_model", model=model_name)
        try:
            self.model = SentenceTransformer(model_name)
            self.model_name = model_name
            self.embedding_dim = self.model.get_sentence_embedding_dimension()
            logger.info(
                "embedding_model_loaded",
                model=model_name,
                dimension=self.embedding_dim,
            )
        except Exception as exc:
            logger.error("embedding_model_load_failed", model=model_name, error=str(exc))
            raise
    
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a batch of texts.
        
        Args:
            texts: List of text strings to embed
            
        Returns:
            List of embedding vectors (each is a list of floats)
            
        Example:
            >>> service = EmbeddingService()
            >>> embeddings = service.embed_texts(["Hello world", "Goodbye world"])
            >>> len(embeddings)
            2
            >>> len(embeddings[0])
            384
        """
        if not texts:
            logger.warning("embed_texts_empty_input")
            return []
        
        try:
            # Encode returns numpy arrays, convert to lists
            embeddings = self.model.encode(
                texts,
                show_progress_bar=False,
                convert_to_numpy=True,
            )
            
            # Convert numpy arrays to Python lists
            embeddings_list = [embedding.tolist() for embedding in embeddings]
            
            logger.info(
                "embeddings_generated",
                count=len(texts),
                dimension=len(embeddings_list[0]) if embeddings_list else 0,
            )
            
            return embeddings_list
            
        except Exception as exc:
            logger.error("embedding_generation_failed", error=str(exc), count=len(texts))
            raise
    
    def embed_single(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.
        
        Args:
            text: Text string to embed
            
        Returns:
            Embedding vector as list of floats
            
        Example:
            >>> service = EmbeddingService()
            >>> embedding = service.embed_single("Hello world")
            >>> len(embedding)
            384
        """
        if not text or not text.strip():
            logger.warning("embed_single_empty_input")
            return [0.0] * self.embedding_dim
        
        embeddings = self.embed_texts([text])
        return embeddings[0] if embeddings else [0.0] * self.embedding_dim


# Global singleton instance
# Initialized on first import to avoid reloading model multiple times
_embedding_service_instance = None


def get_embedding_service() -> EmbeddingService:
    """
    Get or create the global embedding service singleton.
    
    Returns:
        EmbeddingService instance
    """
    global _embedding_service_instance
    if _embedding_service_instance is None:
        _embedding_service_instance = EmbeddingService()
    return _embedding_service_instance


# Create singleton on module import (for Celery tasks)
embedding_service = get_embedding_service()
