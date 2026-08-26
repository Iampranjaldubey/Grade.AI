# Document Processing Troubleshooting - Quick Reference

## TL;DR - What's Happening

Your Celery logs show the **evaluation task is correctly retrying** because the document hasn't finished processing yet. This is normal behavior.

**The actual problem:** The `process_document` task may not be running or completing.

## Quick Diagnostic (5 minutes)

### Run Diagnostic Script

**Windows:**
```bash
diagnose-system.bat
```

**Linux/Mac:**
```bash
chmod +x diagnose-system.sh
./diagnose-system.sh
```

### Key Things to Check

| Check | Command | Expected Result |
|-------|---------|-----------------|
| Celery worker running? | `docker ps \| grep celery` | Should show "Up" status |
| Worker logs? | `docker logs gradeai-celery --tail=20` | Should show "celery@... ready" |
| Redis working? | `docker exec gradeai-redis redis-cli PING` | Should return "PONG" |
| Document status? | See SQL queries in `diagnose-documents.sql` | Should show `parse_status` |

## Common Issues & 60-Second Fixes

### Issue 1: Celery Worker Not Running

**Symptoms:** No task logs at all

**Fix:**
```bash
docker-compose restart celery-worker
docker logs gradeai-celery -f
```

### Issue 2: MinIO CORS Not Configured

**Symptoms:** Upload succeeds but file not accessible

**Fix:** See `MINIO_QUICK_FIX.md` - takes 2 minutes

### Issue 3: Document Stuck in PENDING

**Symptoms:** Document created but never processes

**Check:**
```bash
# Is task queued?
docker exec gradeai-redis redis-cli LLEN celery

# Worker logs show task?
docker logs gradeai-celery | grep "process_document"
```

**Fix:**
```bash
# Restart worker
docker-compose restart celery-worker
```

### Issue 4: Document Processing FAILED

**Symptoms:** parse_status = 'failed' in database

**Check Logs:**
```bash
docker logs gradeai-celery | grep -A 5 "parsing_failed"
```

**Common Causes:**
- Invalid/corrupted file
- Unsupported MIME type
- File too large
- ChromaDB connection failed

## What Should Happen (Timeline)

```
[0s]   Student clicks "Submit"
[1s]   File uploads to MinIO via presigned URL
[2s]   Frontend confirms upload → Creates Document record
[3s]   Backend triggers process_document.delay()
[5s]   Celery worker picks up task
[10s]  Text extracted from file
[15s]  Text chunked into pieces
[20s]  Embeddings generated
[25s]  Chunks stored in database
[30s]  Embeddings stored in ChromaDB
[31s]  Document parse_status → SUCCESS
[32s]  Professor can now evaluate
```

**If it's been > 2 minutes and status is still PENDING:**
→ Something is wrong (worker not running or task failed)

## Logs You Should See (Celery Worker)

### Successful Processing:
```
[INFO] Task gradeai.process_document received
[INFO] process_document_started document_id=...
[INFO] document_loaded file_key=... mime_type=...
[INFO] file_downloaded size_bytes=...
[INFO] text_extracted length=...
[INFO] text_chunked num_chunks=...
[INFO] embeddings_generated count=...
[INFO] chunks_stored_in_db count=...
[INFO] chunks_stored_in_chromadb count=...
[INFO] process_document_completed num_chunks=...
```

### Failed Processing:
```
[ERROR] process_document_failed error=... attempt=1
[INFO] retrying_document_processing countdown=30
```

## SQL Quick Checks

```sql
-- Quick status check
SELECT file_name, parse_status, created_at 
FROM documents 
WHERE doc_type = 'submission' 
ORDER BY created_at DESC 
LIMIT 5;

-- Is document ready?
SELECT 
    file_name,
    parse_status,
    CASE 
        WHEN parse_status = 'success' THEN '✅ Ready'
        WHEN parse_status = 'processing' THEN '⏳ Processing'
        WHEN parse_status = 'pending' THEN '⏸️ Waiting'
        WHEN parse_status = 'failed' THEN '❌ Failed'
    END as status_emoji
FROM documents
WHERE id = 'your-document-id-here';
```

Run from Docker:
```bash
docker exec -it gradeai-postgres psql -U gradeai -d gradeai -c "SELECT file_name, parse_status, created_at FROM documents WHERE doc_type = 'submission' ORDER BY created_at DESC LIMIT 5;"
```

## Frontend Should Show

Currently, the frontend doesn't provide feedback on document processing status. Here's what it **should** show:

```
After Upload:
┌─────────────────────────────────────┐
│ 📄 essay.pdf uploaded                │
│ ⏳ Processing document...            │
│ This may take 30-60 seconds          │
└─────────────────────────────────────┘

After Processing:
┌─────────────────────────────────────┐
│ 📄 essay.pdf                         │
│ ✅ Ready for evaluation              │
│ (45 text chunks created)             │
└─────────────────────────────────────┘
```

## Decision Tree

```
Document not evaluating?
│
├─ Is Celery worker running?
│  └─ NO → docker-compose restart celery-worker
│  └─ YES → Continue
│
├─ Check document parse_status in DB
│  ├─ PENDING → Task not picked up
│  │  └─ Check: docker logs gradeai-celery
│  │  └─ Check: Redis queue length
│  │
│  ├─ PROCESSING → Task running (wait 1-2 min)
│  │  └─ If stuck > 5 min → Check Celery logs for errors
│  │
│  ├─ FAILED → Check Celery logs for error
│  │  └─ Common: File not found in MinIO
│  │  └─ Common: Unsupported file type
│  │  └─ Common: Text extraction failed
│  │
│  └─ SUCCESS → Document is ready!
│     └─ Evaluation should work now
│
└─ Still stuck? → See DOCUMENT_PROCESSING_DIAGNOSIS.md
```

## Get Help

**Provide these to diagnose:**

1. **Celery worker logs:**
   ```bash
   docker logs gradeai-celery --tail=100 > celery-logs.txt
   ```

2. **Document status:**
   ```bash
   docker exec -it gradeai-postgres psql -U gradeai -d gradeai -c "SELECT id, file_name, parse_status, created_at, updated_at FROM documents WHERE doc_type = 'submission' ORDER BY created_at DESC LIMIT 5;" > document-status.txt
   ```

3. **System status:**
   ```bash
   docker ps > system-status.txt
   ```

## Files Reference

- `DOCUMENT_PROCESSING_DIAGNOSIS.md` - Detailed investigation guide
- `diagnose-system.bat` / `.sh` - Automated system check
- `diagnose-documents.sql` - Database diagnostic queries
- `MINIO_QUICK_FIX.md` - MinIO CORS setup (if you have it)
- This file - Quick reference for fast troubleshooting

## Next Action

**Run this now:**
```bash
# 1. Check worker status
docker logs gradeai-celery --tail=30

# 2. Check document status
docker exec -it gradeai-postgres psql -U gradeai -d gradeai -c "SELECT file_name, parse_status, created_at FROM documents WHERE doc_type = 'submission' ORDER BY created_at DESC LIMIT 3;"

# 3. Report back what you see
```

The output from these commands will tell us exactly where the pipeline is stuck.
