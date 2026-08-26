# Phase 3B Quick Reference Card

## 🎯 One-Page Cheat Sheet

### Installation
```bash
cd backend
pip install -r requirements.txt  # Adds pdfplumber, python-docx, torch, sentence-transformers
```

### Start Services
```bash
# Terminal 1: Celery Worker (REQUIRED for processing!)
celery -A app.celery_app worker --loglevel=info

# Terminal 2: Backend (if not running)
uvicorn app.main:app --reload
```

### Key Files
```
backend/app/rag/parsers.py        - Text extraction (PDF/DOCX/TXT)
backend/app/rag/chunker.py        - Split into chunks
backend/app/rag/embeddings.py     - Generate embeddings
backend/app/infrastructure/chromadb_client.py - Vector storage
backend/app/tasks/grading.py      - Main processing task
backend/app/db/sync_session.py    - Sync DB for Celery
```

### Processing Pipeline
```
Upload → Confirm → Celery Task:
  1. Download from S3
  2. Parse text (PDF/DOCX/TXT)
  3. Chunk (~500 tokens, 50 overlap)
  4. Generate embeddings (384-dim)
  5. Store in PostgreSQL + ChromaDB
  6. Status: PENDING → PROCESSING → SUCCESS
```

### Test Document Processing
```bash
# 1. Upload via API (see PHASE3A_TESTING.md)
# 2. Watch Celery logs:
#    → process_document_started
#    → text_extracted length=5432
#    → embeddings_generated count=12
#    → process_document_completed ✓

# 3. Check status:
curl http://localhost:8000/api/v1/uploads/$DOC_ID/status \
  -H "Authorization: Bearer $TOKEN"

# Should show: "parse_status": "success", "chunk_count": 12
```

### Verify in Database
```sql
-- Document status
SELECT id, file_name, parse_status, LENGTH(parsed_text)
FROM documents
ORDER BY created_at DESC LIMIT 5;

-- Chunks created
SELECT d.file_name, COUNT(dc.id) as chunks
FROM documents d
LEFT JOIN document_chunks dc ON dc.document_id = d.id
GROUP BY d.id, d.file_name
ORDER BY d.created_at DESC LIMIT 5;
```

### Verify in ChromaDB
```python
from app.infrastructure.chromadb_client import ChromaDBClient
from app.core.config import get_settings

client = ChromaDBClient(get_settings())
client.connect()

collections = client.client.list_collections()
for col in collections:
    print(f"{col.name}: {col.count()} chunks")
```

### Common Issues
| Problem | Solution |
|---------|----------|
| Celery not receiving tasks | Check Redis: `redis-cli ping` |
| parse_status stuck on PENDING | Start Celery worker |
| Module not found | `pip install -r requirements.txt` |
| ChromaDB connection refused | Start ChromaDB: `docker-compose up chromadb` |
| Out of memory | Increase chunk_size or add more workers |

### Performance
| File Type | Size | Time | Chunks |
|-----------|------|------|--------|
| PDF | 1MB | ~5s | 8-15 |
| PDF | 5MB | ~20s | 40-60 |
| DOCX | 500KB | ~6s | 10-20 |
| TXT | 100KB | ~2s | 5-10 |

### Key Configurations
```python
# Chunking (app/rag/chunker.py)
chunk_text(text, chunk_size=500, overlap=50)

# Embeddings (app/rag/embeddings.py)
Model: "all-MiniLM-L6-v2"
Dimensions: 384
Cost: Free (local)

# Retry Logic (app/tasks/grading.py)
max_retries=3
Delays: 30s, 60s, 120s (exponential backoff)
```

### Status Flow
```
PENDING → File uploaded, task queued
PROCESSING → Celery is working on it
SUCCESS → All done, chunks stored
FAILED → Error occurred (check logs)
```

### What's Stored Where
| Data | Location | Size/Chunk |
|------|----------|------------|
| File | S3 | Original size |
| Parsed text | PostgreSQL (documents.parsed_text) | Full text |
| Chunks | PostgreSQL (document_chunks) | ~500 tokens |
| Embeddings | ChromaDB | 384 floats (~1.5KB) |

### Monitoring
```bash
# Celery logs
celery -A app.celery_app worker --loglevel=info

# Flower UI
pip install flower
celery -A app.celery_app flower
# http://localhost:5555

# Check task status
from app.celery_app import celery_app
result = celery_app.AsyncResult('task-id')
print(result.state, result.info)
```

### Testing
```bash
# Unit tests
pytest tests/test_parsers.py -v
pytest tests/test_chunker.py -v
pytest tests/test_embeddings.py -v
pytest tests/test_chromadb.py -v

# Integration test
pytest tests/test_integration_pipeline.py -v

# All tests
pytest tests/ -v --cov=app
```

### Documentation
- **Full Implementation**: PHASE3B_IMPLEMENTATION.md
- **Testing Guide**: PHASE3B_TESTING.md
- **Quick Start**: PHASE3B_README.md
- **Summary**: PHASE3B_SUMMARY.md

### API Endpoints (from Phase 3A)
```
POST /api/v1/uploads/presign       - Get upload URL
POST /api/v1/uploads/confirm       - Confirm & trigger processing
GET  /api/v1/uploads/{id}/status   - Check processing status
GET  /api/v1/uploads/courses/{id}/documents - List documents
```

### Next Phase (Phase 4)
- RAG-based AI grading
- Query ChromaDB with rubric
- LLM generates scores and feedback
- Manual grade adjustment UI
- Grade publishing workflow

---

**Phase 3B Status: ✅ Complete | Ready for Phase 4**

Print this page for quick reference! 🖨️
