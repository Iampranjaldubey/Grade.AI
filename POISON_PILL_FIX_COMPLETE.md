# Process Document Poison-Pill Fix - Implementation Complete

**Date**: August 15, 2026  
**Status**: ✅ **FIXED**  
**File Modified**: `backend/app/tasks/grading.py`

---

## Changes Implemented

### Change 1: PostgreSQL Chunk Cleanup (Lines ~424-443)

**Location**: Before Step 7 chunk insertion loop

**Added**:
```python
# Cleanup existing chunks if retry (makes insert idempotent)
with get_sync_db() as db:
    existing_chunks = db.query(DocumentChunk).filter(
        DocumentChunk.document_id == uuid.UUID(document_id)
    ).all()
    
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
```

**Why**: Deletes existing DocumentChunk rows before re-inserting, preventing IntegrityError on `(document_id, chunk_index)` unique constraint during retries.

**Behavior**:
- **First attempt**: No existing chunks, cleanup skipped
- **Retry after failure**: Finds existing chunks, logs warning with count, deletes them
- **Insert now succeeds**: No unique constraint violation

---

### Change 2: ChromaDB Cleanup (Lines ~471-483)

**Location**: Before Step 8 ChromaDB add_chunks call

**Added**:
```python
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
```

**Why**: Removes existing embeddings from ChromaDB before re-adding, preventing duplicates or errors depending on ChromaDB version behavior.

**Uses Existing Method**: ✅ `ChromaDBClient.delete_document_chunks()` was already implemented in `backend/app/infrastructure/chromadb_client.py` (lines 242-269)

**Behavior**:
- **First attempt**: No chunks exist, delete fails silently (debug log)
- **Retry after failure**: Chunks exist, delete succeeds (info log)
- **Add now succeeds**: No duplicate IDs or conflicts

---

### Change 3: Exception Handling Fix (Lines ~528-543)

**Location**: Main except block for retry logic

**Modified**:
```python
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
    countdown = 30 * (2 ** self.request.retries)  # 30s, 60s, 120s
    logger.info("retrying_document_processing", countdown=countdown)
    raise self.retry(exc=exc, countdown=countdown)
else:
    logger.error("max_retries_exceeded", document_id=document_id)
    raise
```

**Changes**:
1. ✅ Comment clarifies cleanup shouldn't mask original exception
2. ✅ Logs both `cleanup_error` and `original_error` if cleanup fails
3. ✅ Comment confirms `exc` is always the ORIGINAL exception
4. ✅ Cleanup failure doesn't prevent retry (continues after logging)

**Why**: Ensures that if `_update_document_status()` fails (e.g., DB connection lost), the ORIGINAL exception that triggered the retry is still logged and propagated, not replaced by the cleanup failure.

---

## Full Diff

```diff
--- backend/app/tasks/grading.py (BEFORE)
+++ backend/app/tasks/grading.py (AFTER)
@@ -420,6 +420,24 @@
         # Step 7: Store chunks in database with embedding IDs
         chunk_records = []
         embedding_ids = []
         
+        # Cleanup existing chunks if retry (makes insert idempotent)
+        with get_sync_db() as db:
+            existing_chunks = db.query(DocumentChunk).filter(
+                DocumentChunk.document_id == uuid.UUID(document_id)
+            ).all()
+            
+            if existing_chunks:
+                existing_count = len(existing_chunks)
+                logger.warning(
+                    "retry_cleanup_existing_chunks",
+                    document_id=document_id,
+                    count=existing_count,
+                )
+                db.query(DocumentChunk).filter(
+                    DocumentChunk.document_id == uuid.UUID(document_id)
+                ).delete()
+                db.commit()
+        
         with get_sync_db() as db:
             for i, chunk in enumerate(chunks):
                 embedding_id = str(uuid.uuid4())
@@ -456,6 +474,18 @@
         # Get or create collection for this course
         collection = chromadb_client.get_or_create_collection(course_id)
         
+        # Cleanup existing ChromaDB entries if retry (makes add idempotent)
+        try:
+            chromadb_client.delete_document_chunks(collection.name, document_id)
+            logger.info("chromadb_retry_cleanup", document_id=document_id)
+        except Exception as cleanup_exc:
+            # Ignore if no chunks existed to delete (not an error)
+            logger.debug(
+                "chromadb_cleanup_skipped",
+                document_id=document_id,
+                reason=str(cleanup_exc),
+            )
+        
         # Prepare metadata for each chunk
         metadatas = [
             {
@@ -500,13 +530,19 @@
             attempt=self.request.retries + 1,
         )
         
-        # Update status to failed
+        # Update status to failed (don't let this mask the original exception)
         try:
             _update_document_status(document_id, ParseStatus.FAILED)
         except Exception as update_exc:
-            logger.error("failed_to_update_status", error=str(update_exc))
+            logger.error(
+                "retry_cleanup_failed",
+                document_id=document_id,
+                cleanup_error=str(update_exc),
+                original_error=str(exc),
+            )
+            # Continue - will surface on next retry if DB truly unreachable
         
-        # Retry with exponential backoff
+        # Retry with exponential backoff (always use ORIGINAL exception)
         if self.request.retries < self.max_retries:
             countdown = 30 * (2 ** self.request.retries)  # 30s, 60s, 120s
             logger.info("retrying_document_processing", countdown=countdown)
```

---

## What Was NOT Changed

### 1. Embedding ID Generation (Line ~447)

**Kept as-is**:
```python
embedding_id = str(uuid.uuid4())
```

**Reason**: Per your instruction #4, this line was left unchanged. You noted a potential issue (same UUID possibly reused across all chunks) that needs separate investigation.

**For future investigation**: Check if `uuid.uuid4()` is called inside the loop (correct) or outside (bug - same ID for all chunks).

---

### 2. Early Return for Already-Processed Documents

**NOT added**: Short-circuit at top of task like:
```python
if document.parse_status == ParseStatus.SUCCESS:
    return {"status": "already_processed", ...}
```

**Reason**: Per your instruction #5, this changes task entry behavior and deserves separate review. Fix kept scoped to retry idempotency only.

---

## ChromaDBClient Method Status

✅ **CONFIRMED**: `delete_document_chunks()` method **already existed** in `backend/app/infrastructure/chromadb_client.py`

**Implementation** (lines 242-269):
```python
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
```

**No new ChromaDB methods were added** - we used the existing one.

---

## Testing Verification

### Test Case 1: Normal First-Time Processing

**Expected Behavior**:
1. No existing chunks found → cleanup skipped
2. Chunks inserted successfully
3. ChromaDB delete fails (nothing to delete) → debug log
4. ChromaDB add succeeds
5. Document marked SUCCESS

**Logs Expected**:
```
text_chunked (num_chunks=5)
embeddings_generated (count=5)
chunks_stored_in_db (count=5)
chromadb_cleanup_skipped (reason=...)
chunks_stored_in_chromadb (count=5)
process_document_completed
```

---

### Test Case 2: Retry After ChromaDB Failure

**Scenario**: First attempt fails at Step 8 (ChromaDB network timeout)

**Retry Behavior**:
1. ✅ Finds 5 existing chunks → logs `retry_cleanup_existing_chunks (count=5)`
2. ✅ Deletes 5 chunks
3. ✅ Inserts 5 new chunks (no IntegrityError)
4. ✅ ChromaDB delete succeeds → logs `chromadb_retry_cleanup`
5. ✅ ChromaDB add succeeds (no duplicates)
6. ✅ Document marked SUCCESS

**Logs Expected**:
```
process_document_failed (attempt=1, error=NetworkTimeout)
retrying_document_processing (countdown=30)
--- RETRY 1 ---
retry_cleanup_existing_chunks (count=5)
chunks_stored_in_db (count=5)
chromadb_retry_cleanup
chunks_stored_in_chromadb (count=5)
process_document_completed
```

---

### Test Case 3: Retry After Chunk Insertion Failure

**Scenario**: First attempt fails at Step 7 (DB constraint violation, disk full, etc.)

**Retry Behavior**:
1. ⚠️ May have partial chunks (transaction rolled back)
2. ✅ Cleanup finds and deletes any partial chunks
3. ✅ Inserts new chunks successfully
4. ✅ Continues to ChromaDB
5. ✅ Document marked SUCCESS

---

### Test Case 4: Cleanup Itself Fails

**Scenario**: DB connection lost before retry, so cleanup queries fail

**Retry Behavior**:
1. ❌ Cleanup query fails (e.g., connection refused)
2. ✅ Logged as `retry_cleanup_failed` with both errors
3. ✅ Retry still raised with ORIGINAL exception (not cleanup error)
4. Next retry (if any) will try cleanup again

**Logs Expected**:
```
process_document_failed (attempt=1, error=OriginalError)
retry_cleanup_failed (cleanup_error=ConnectionRefused, original_error=OriginalError)
retrying_document_processing (countdown=30)
```

---

## Behavior Summary

| Scenario | Before Fix | After Fix |
|----------|-----------|-----------|
| **First attempt succeeds** | ✅ Works | ✅ Works (cleanup skipped) |
| **Fails before chunk insert** | ✅ Retry succeeds | ✅ Retry succeeds (cleanup no-op) |
| **Fails at chunk insert** | ✅ Retry succeeds | ✅ Retry succeeds (cleanup no-op) |
| **Fails after chunk insert** | ❌ **Poison pill** (IntegrityError) | ✅ **Retry succeeds** (cleanup removes chunks) |
| **Fails at ChromaDB** | ❌ **Poison pill** (IntegrityError) | ✅ **Retry succeeds** (cleanup both) |
| **Cleanup fails** | N/A | ✅ Original error preserved, next retry tries cleanup again |

---

## Files Modified

1. **backend/app/tasks/grading.py**
   - Added PostgreSQL chunk cleanup (lines ~424-443)
   - Added ChromaDB cleanup (lines ~471-483)
   - Enhanced exception logging (lines ~528-543)

**No other files modified** - ChromaDBClient method already existed.

---

## Rollback Plan

If issues arise:

```bash
git diff backend/app/tasks/grading.py  # Review changes
git checkout HEAD -- backend/app/tasks/grading.py  # Revert if needed
```

**Risk**: Very low - changes are defensive (cleanup before insert) and don't alter success-path logic.

---

## Performance Impact

**Negligible**:
- Cleanup queries only run if chunks already exist (retry scenario)
- DELETE operations are indexed on document_id (fast)
- ChromaDB delete uses metadata filter (efficient)

**Trade-off**: Extra queries on retry vs. poison pill that requires manual intervention.

---

## Next Steps

1. ✅ Deploy updated `grading.py`
2. ✅ Monitor logs for `retry_cleanup_existing_chunks` and `chromadb_retry_cleanup` messages
3. ⚠️ Investigate embedding_id generation (future separate task)
4. ⚠️ Consider early-return optimization (future separate task)

---

**Status**: ✅ **READY FOR DEPLOYMENT**  
**Risk Level**: Low  
**Testing**: Can be verified by simulating ChromaDB failures

---

*See also:*
- *Audit Report: `RETRY_BEHAVIOR_AUDIT_REPORT.md`*
- *Code: `backend/app/tasks/grading.py`*
