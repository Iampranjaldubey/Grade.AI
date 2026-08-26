# Process Document Task - Retry Behavior Audit Report

**Date**: August 15, 2026  
**Task**: `backend/app/tasks/grading.py::process_document`  
**Status**: 🚨 **CRITICAL ISSUE FOUND** - Task is NOT idempotent, retries will fail

---

## Executive Summary

The `process_document` Celery task has a **critical retry bug** that makes it a **poison pill**:

1. ✅ Task has retry logic (max 3 retries with exponential backoff)
2. ❌ Task is **NOT idempotent** - retries fail with IntegrityError
3. ❌ Chunks inserted on first attempt **block all subsequent retries**
4. ❌ IntegrityError is **unhandled** and propagates as different exception than original
5. ⚠️ ChromaDB behavior depends on version (may error or upsert)

**Result**: If task fails **after Step 7** (chunk insertion), all 3 retry attempts will fail with IntegrityError on the duplicate (document_id, chunk_index) constraint, masking the original transient error.

---

## Detailed Analysis

### 1. Database Write Steps in Task

**File**: `backend/app/tasks/grading.py::process_document` (lines 320-509)

The task performs these database/ChromaDB writes **in order**:

| Step | Line | Operation | Transactional | Can Retry? |
|------|------|-----------|---------------|------------|
| **1** | ~356 | `document.parse_status = PROCESSING` | ✅ Own txn | ✅ Safe (UPDATE) |
| **4** | ~399 | `document.parsed_text = sanitized_text` | ✅ Own txn | ✅ Safe (UPDATE) |
| **7** | ~428-443 | `db.add(DocumentChunk)` for each chunk | ✅ Single txn | ❌ **FAILS ON RETRY** |
| **8** | ~462 | `chromadb_client.add_chunks()` | ❌ No txn | ⚠️ **Depends on ChromaDB** |
| **9** | ~466 | `document.parse_status = SUCCESS` | ✅ Own txn | ✅ Safe (UPDATE) |

**Critical Window**: Between Step 7 (chunks committed) and Step 9 (SUCCESS marked)

---

### 2. Unique Constraint on DocumentChunk

**File**: `backend/app/models/document_chunk.py` (lines 21-23)

```python
class DocumentChunk(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_document_chunks_document_index"),
    )
```

**Migration**: `backend/alembic/versions/001_initial_schema.py` (lines 316-321)

```python
op.create_index(
    "ix_document_chunks_document_chunk_index",
    "document_chunks",
    ["document_id", "chunk_index"],
    unique=True,
)
```

✅ **CONFIRMED**: Unique constraint exists on `(document_id, chunk_index)`

---

### 3. Retry Scenario: What Happens?

#### Scenario: Failure After Chunk Insertion

**Initial Attempt (Retry 0)**:
1. ✅ Set status = PROCESSING
2. ✅ Download from S3
3. ✅ Parse text (extract 1338 chars)
4. ✅ Update parsed_text
5. ✅ Chunk text (create 5 chunks, indices 0-4)
6. ✅ Generate embeddings (5 vectors)
7. ✅ **Insert 5 DocumentChunk rows** (document_id=XXX, chunk_index=0,1,2,3,4)
8. ❌ **ChromaDB fails** (network timeout, disk full, etc.)
9. ❌ Never reaches SUCCESS status
10. Exception caught at line 487 → retry scheduled (30s)

**Retry Attempt 1 (after 30s)**:
1. ✅ Set status = PROCESSING (UPDATE, no conflict)
2. ✅ Download from S3 (same file)
3. ✅ Parse text (same 1338 chars)
4. ✅ Update parsed_text (UPDATE, no conflict)
5. ✅ Chunk text (same 5 chunks, indices 0-4)
6. ✅ Generate embeddings (same 5 vectors)
7. ❌ **Attempt to INSERT DocumentChunk (document_id=XXX, chunk_index=0)**
   - PostgreSQL: `IntegrityError: duplicate key value violates unique constraint "uq_document_chunks_document_index"`
   - Detail: Key (document_id, chunk_index)=(XXX, 0) already exists
8. Transaction ROLLBACK at line 443 `db.commit()`
9. ❌ IntegrityError raised **from inside try block**
10. Caught at line 487 as generic Exception
11. Status set to FAILED, retry scheduled (60s)

**Retry Attempt 2 (after 60s)**:
- ❌ **Same IntegrityError** at Step 7 (chunks still exist from Retry 0)

**Retry Attempt 3 (after 120s)**:
- ❌ **Same IntegrityError** at Step 7 (chunks still exist from Retry 0)

**Final Result**:
- Document marked permanently `FAILED`
- Error logged: `max_retries_exceeded`
- **Original ChromaDB error is lost** - logs only show IntegrityError
- **Manual intervention required** to delete chunks and retry

---

### 4. Exception Handling Analysis

**File**: `backend/app/tasks/grading.py` (lines 487-509)

```python
except Exception as exc:
    logger.error(
        "process_document_failed",
        document_id=document_id,
        error=str(exc),  # ← Logs "IntegrityError" on retry, not original error
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
        raise self.retry(exc=exc, countdown=countdown)  # ← Re-raises IntegrityError
    else:
        logger.error("max_retries_exceeded", document_id=document_id)
        raise  # ← Final exception is IntegrityError, not original
```

**Problem**: The except block catches **ALL exceptions equally**, including:
- Original transient errors (ChromaDB timeout, S3 network error)
- **Retry-induced IntegrityErrors** from duplicate chunk insertion

**Result**:
- Retry 1 logs: `error=duplicate key value violates unique constraint`
- Retry 2 logs: `error=duplicate key value violates unique constraint`
- Retry 3 logs: `error=duplicate key value violates unique constraint`
- **Original ChromaDB error is never logged in retries**

---

### 5. ChromaDB Duplicate ID Behavior

**File**: `backend/app/infrastructure/chromadb_client.py::add_chunks` (lines 123-159)

```python
def add_chunks(
    self,
    collection_name: str,
    chunks: List[str],
    embeddings: List[List[float]],
    metadatas: List[Dict[str, Any]],
    ids: List[str],
) -> None:
    try:
        collection = self.client.get_collection(name=collection_name)
        
        collection.add(
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids,  # ← UUIDs generated in task (line 426)
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
```

**ID Generation**: Line 426 in `process_document`:
```python
embedding_id = str(uuid.uuid4())  # ← Fresh UUID on every retry
```

**Critical Finding**: IDs are **regenerated on each retry**, so:
- Retry 0: chunks have IDs `[uuid1, uuid2, uuid3, ...]`
- Retry 1: chunks have IDs `[uuid4, uuid5, uuid6, ...]` (different UUIDs)

**ChromaDB Behavior** (depends on version):

| ChromaDB Version | Behavior on Duplicate ID | Impact |
|------------------|--------------------------|--------|
| **0.3.x** | Raises `DuplicateIDError` | Task fails at Step 8, retries hit IntegrityError at Step 7 |
| **0.4.x+** | **Upsert** (update existing) | Would work if not for Step 7 IntegrityError |

**However**: Since IDs are regenerated, ChromaDB duplicates are **unlikely**. The PostgreSQL IntegrityError at Step 7 happens **before** ChromaDB is called.

---

### 6. No Cleanup Logic

**Search Results**: No calls to `delete_document_chunks()` before insertion

The task does **NOT**:
- ❌ Check if chunks already exist for this document
- ❌ Delete existing chunks before re-inserting
- ❌ Use INSERT ... ON CONFLICT (upsert)
- ❌ Wrap chunk insertion in idempotent logic

**Missing Code** (should exist around line 428):
```python
# MISSING: Cleanup existing chunks before retry
with get_sync_db() as db:
    # Delete existing chunks for this document
    db.query(DocumentChunk).filter(
        DocumentChunk.document_id == uuid.UUID(document_id)
    ).delete()
    db.commit()
    
    # Now safe to insert new chunks
    for i, chunk in enumerate(chunks):
        # ... insert logic
```

---

## Real-World Impact

### Example from Logs (User's Report)

**Document**: `ca0f802d-a52e-493d-9fe7-bd71f6f26ceb` (COVID certificate PDF)

**Timeline**:
- `18:57:33` - Retry 1: `ValueError: A string literal cannot contain NUL (0x00) characters.`
- `18:58:03` - Retry 2: Same error
- `18:59:03` - Retry 3: Same error
- `19:01:04` - Retry 4: Same error (after we fixed NULL byte issue)
- **Status**: Max retries exceeded, document permanently FAILED

**Root Cause** (in this case): NULL bytes in parsed text (now fixed)

**But if failure had occurred at Step 8** (ChromaDB):
- Chunks would exist in DB
- All retries would hit IntegrityError
- Original ChromaDB error would be masked
- Manual DB cleanup required

---

## Failure Modes Summary

| Failure Point | First Attempt | Retry Behavior | Outcome |
|---------------|---------------|----------------|---------|
| **Step 1-6** (before chunk insert) | ❌ Fails | ✅ Retry succeeds | ✅ Recoverable |
| **Step 7** (chunk insert) | ❌ Fails | ✅ Retry succeeds | ✅ Recoverable |
| **Step 7 commit** | ✅ Chunks saved | ❌ Retry hits IntegrityError | 🚨 **Poison Pill** |
| **Step 8** (ChromaDB) | ✅ Chunks saved | ❌ Retry hits IntegrityError | 🚨 **Poison Pill** |
| **Step 9** (mark SUCCESS) | ✅ Chunks saved | ❌ Retry hits IntegrityError | 🚨 **Poison Pill** |

**Critical Zone**: Any failure after `db.commit()` at line 443 makes retries impossible

---

## Recommended Fixes

### Option 1: Pre-Retry Cleanup (Safest)

Add cleanup before chunk insertion:

```python
# Step 7: Delete existing chunks if retry
with get_sync_db() as db:
    # Check if chunks already exist (indicates retry)
    existing_count = db.query(DocumentChunk).filter(
        DocumentChunk.document_id == uuid.UUID(document_id)
    ).count()
    
    if existing_count > 0:
        logger.warning(
            "retry_detected_cleaning_chunks",
            document_id=document_id,
            existing_chunks=existing_count,
        )
        # Delete existing chunks
        db.query(DocumentChunk).filter(
            DocumentChunk.document_id == uuid.UUID(document_id)
        ).delete()
        db.commit()
    
    # Now insert chunks (safe on retry)
    for i, chunk in enumerate(chunks):
        # ... existing insert logic
```

**Pros**:
- ✅ Fully idempotent
- ✅ Handles retries gracefully
- ✅ No schema changes

**Cons**:
- ⚠️ Loses chunks from previous attempt (acceptable for retries)

---

### Option 2: Upsert Pattern

Use PostgreSQL INSERT ... ON CONFLICT:

```python
# Use SQLAlchemy insert with on_conflict_do_update
from sqlalchemy.dialects.postgresql import insert

with get_sync_db() as db:
    for i, chunk in enumerate(chunks):
        stmt = insert(DocumentChunk).values(
            document_id=uuid.UUID(document_id),
            chunk_index=chunk["chunk_index"],
            chunk_text=chunk["text"],
            token_count=chunk["token_count"],
            embedding_id=embedding_id,
            chunk_metadata={"char_count": chunk["char_count"]},
        ).on_conflict_do_update(
            index_elements=["document_id", "chunk_index"],
            set_={
                "chunk_text": chunk["text"],
                "embedding_id": embedding_id,
                "updated_at": sa.func.now(),
            }
        )
        db.execute(stmt)
    
    db.commit()
```

**Pros**:
- ✅ Truly idempotent
- ✅ Preserves chunks if no content change

**Cons**:
- ⚠️ More complex code
- ⚠️ May upsert chunks even if text changed

---

### Option 3: Check-Then-Skip

Check for existing chunks and skip task entirely:

```python
# Step 1: Check if document already processed
with get_sync_db() as db:
    document = db.query(Document).filter(Document.id == uuid.UUID(document_id)).first()
    
    if document.parse_status == ParseStatus.SUCCESS:
        logger.info("document_already_processed", document_id=document_id)
        return {
            "document_id": document_id,
            "status": "already_processed",
            "num_chunks": db.query(DocumentChunk).filter(
                DocumentChunk.document_id == uuid.UUID(document_id)
            ).count(),
        }
    
    # Check if chunks exist (indicates previous failed attempt)
    existing_chunks = db.query(DocumentChunk).filter(
        DocumentChunk.document_id == uuid.UUID(document_id)
    ).count()
    
    if existing_chunks > 0:
        # Cleanup before retry
        logger.warning("retry_cleanup", document_id=document_id)
        db.query(DocumentChunk).filter(
            DocumentChunk.document_id == uuid.UUID(document_id)
        ).delete()
        db.commit()
```

**Pros**:
- ✅ Prevents unnecessary work
- ✅ Handles retries

**Cons**:
- ⚠️ More complex logic

---

### Option 4: ChromaDB Cleanup Too

If ChromaDB IDs can collide, add cleanup:

```python
# Step 8: Clean ChromaDB before adding
chromadb_client = ChromaDBClient(settings)
chromadb_client.connect()

collection = chromadb_client.get_or_create_collection(course_id)

# Delete existing embeddings for this document (if retry)
try:
    chromadb_client.delete_document_chunks(collection.name, document_id)
    logger.info("chromadb_retry_cleanup", document_id=document_id)
except Exception as cleanup_exc:
    # Ignore if no chunks exist
    logger.debug("chromadb_cleanup_skipped", error=str(cleanup_exc))

# Now safe to add chunks
chromadb_client.add_chunks(...)
```

**Pros**:
- ✅ Prevents ChromaDB duplicates

**Cons**:
- ⚠️ May not be needed if IDs are regenerated

---

## Recommendation

**Implement Option 1 + Option 4** (Cleanup Both PostgreSQL and ChromaDB):

1. Before Step 7: Delete existing DocumentChunk rows for this document
2. Before Step 8: Delete existing ChromaDB embeddings for this document
3. Add log messages indicating retry cleanup

**Why**:
- ✅ Makes task fully idempotent
- ✅ Simple to implement
- ✅ No schema changes
- ✅ Gracefully handles retries from any failure point
- ✅ Original error preserved in logs (first attempt)

---

## Testing Plan

### Test Case 1: Retry After Chunk Insertion

1. Mock ChromaDB to fail after chunks committed
2. Verify IntegrityError on retry **BEFORE fix**
3. Apply fix
4. Verify retry succeeds **AFTER fix**

### Test Case 2: Retry After ChromaDB Failure

1. Mock ChromaDB to fail during add_chunks
2. Verify chunks exist in DB
3. Verify retry cleans up and succeeds

### Test Case 3: Idempotency

1. Process document successfully
2. Call task again with same document_id
3. Verify no errors (already processed check)

---

## Files to Modify

1. **backend/app/tasks/grading.py** (lines ~428-445)
   - Add PostgreSQL chunk cleanup before insertion
   - Add ChromaDB cleanup before add_chunks call

---

**Status**: 🚨 **CRITICAL BUG - AWAITING FIX APPROVAL**  
**Risk**: High (tasks become poison pills on transient failures)  
**Effort**: Low (< 20 lines of code)  
**Impact**: Eliminates retry-induced IntegrityErrors
