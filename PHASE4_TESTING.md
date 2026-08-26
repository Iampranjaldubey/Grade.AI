# Phase 4 Testing Guide - AI Evaluation Engine

## Prerequisites

### 1. Infrastructure Running
```bash
# Check all services are up
docker-compose ps

# Should see:
# - PostgreSQL (port 5432)
# - Redis (port 6379)
# - MinIO (port 9000)
# - ChromaDB (port 8001)
```

### 2. Backend Running
```bash
cd backend

# Start FastAPI
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Start Celery worker (separate terminal)
celery -A app.celery_app worker --loglevel=info
```

### 3. Environment Variables
```bash
# .env file must have:
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_MODEL=gemini-2.0-flash
CHROMADB_HOST=localhost
CHROMADB_PORT=8001
DATABASE_URL=postgresql+asyncpg://gradeai:gradeai@localhost:5432/gradeai
```

---

## Test Scenario 1: Complete Submission → Evaluation Flow

### Step 1: Create Test Course (Professor)

```bash
# Register professor
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dr. Alice Smith",
    "email": "alice@university.edu",
    "password": "password123",
    "role": "professor"
  }'

# Login and save access token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@university.edu",
    "password": "password123"
  }'

# Save the access_token as PROF_TOKEN
export PROF_TOKEN="<access_token>"
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxOTRlNTFjZi01YjdiLTRkYjEtYjU5NS1iZGExNGRkNWY4NzgiLCJyb2xlIjoicHJvZmVzc29yIiwianRpIjoiZjlhOWFhMTMtYTQ4NC00Y2U4LTg1NGMtMDM2OGYzNzZhOGM1IiwidHlwZSI6ImFjY2VzcyIsImV4cCI6MTc4MTI4NjI3NH0.voQ5IoLhEx5Ge06sz39J0W_F7962u4gIoh-DcGMFNgw

# Create course
curl -X POST http://localhost:8000/api/v1/courses \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "course_name": "Introduction to Computer Science",
    "course_code": "CS101",
    "semester": "Fall 2026",
    "description": "Learn programming fundamentals"
  }'

# Save course_id from response
export COURSE_ID="<course_id>"
```

### Step 2: Create Assignment with Rubrics

```bash
# Create assignment
curl -X POST http://localhost:8000/api/v1/assignments \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "course_id": "'"$COURSE_ID"'",
    "title": "Python Functions Assignment",
    "description": "Write Python functions to solve basic problems",
    "due_date": "2026-12-31T23:59:59Z",
    "max_score": 100,
    "grading_mode": "auto"
  }'

# Save assignment_id
export ASSIGNMENT_ID="<assignment_id>"

# Create rubrics
curl -X POST http://localhost:8000/api/v1/assignments/$ASSIGNMENT_ID/rubrics \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "criteria": [
      {
        "criteria_name": "Code Correctness",
        "description": "Functions produce correct output for all test cases",
        "max_points": 40,
        "weight": 40,
        "evaluation_hints": "Check edge cases, error handling, proper return values"
      },
      {
        "criteria_name": "Code Quality",
        "description": "Clean, readable code following Python conventions",
        "max_points": 30,
        "weight": 30,
        "evaluation_hints": "PEP 8 style, meaningful variable names, proper comments"
      },
      {
        "criteria_name": "Documentation",
        "description": "Proper docstrings and comments",
        "max_points": 20,
        "weight": 20,
        "evaluation_hints": "Function docstrings, inline comments for complex logic"
      },
      {
        "criteria_name": "Efficiency",
        "description": "Efficient algorithm choices",
        "max_points": 10,
        "weight": 10,
        "evaluation_hints": "Time complexity, avoid unnecessary loops"
      }
    ]
  }'
```

### Step 3: Upload Course Notes (Professor)

```bash
# Create notes.txt file
cat > notes.txt << 'EOF'
Python Functions Best Practices:
- Use descriptive function names (verb + noun)
- Always include docstrings with parameters and return values
- Keep functions small and focused on one task
- Use type hints for better code clarity
- Handle edge cases and invalid inputs
- Follow PEP 8 naming conventions (lowercase_with_underscores)

Common Mistakes to Avoid:
- Missing return statements
- Not handling None values
- Overly complex nested loops
- Poor variable naming
EOF

# Get presigned upload URL
curl -X POST http://localhost:8000/api/v1/uploads/presign \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "notes.txt",
    "content_type": "text/plain",
    "doc_type": "notes",
    "course_id": "'"$COURSE_ID"'"
  }'

# Save upload_url and file_key
export UPLOAD_URL="<upload_url>"
export FILE_KEY="<file_key>"

# Upload file to S3/MinIO
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: text/plain" \
  --data-binary @notes.txt

# Confirm upload
curl -X POST http://localhost:8000/api/v1/uploads/confirm \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_key": "'"$FILE_KEY"'",
    "file_name": "notes.txt",
    "file_size_bytes": 500,
    "doc_type": "notes",
    "course_id": "'"$COURSE_ID"'"
  }'

# Save document_id
export DOC_ID="<document_id>"

# Wait for processing (check status every 5 seconds)
while true; do
  STATUS=$(curl -s http://localhost:8000/api/v1/documents/$DOC_ID/status \
    -H "Authorization: Bearer $PROF_TOKEN" | jq -r '.parse_status')
  echo "Status: $STATUS"
  [[ "$STATUS" == "success" ]] && break
  sleep 5
done
```

### Step 4: Student Enrollment and Submission

```bash
# Register student
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bob Johnson",
    "email": "bob@student.edu",
    "password": "password123",
    "role": "student"
  }'

# Login student
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bob@student.edu",
    "password": "password123"
  }'

# Save access_token
export STUDENT_TOKEN="<access_token>"

# Get course join code (from course creation response)
export JOIN_CODE="<join_code>"

# Join course
curl -X POST http://localhost:8000/api/v1/enrollments/join \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "join_code": "'"$JOIN_CODE"'"
  }'

# Create submission file
cat > submission.txt << 'EOF'
def calculate_average(numbers):
    """Calculate the average of a list of numbers.
    
    Args:
        numbers: List of numeric values
        
    Returns:
        float: The average value
    """
    if not numbers:
        return 0
    return sum(numbers) / len(numbers)

def find_max(numbers):
    """Find the maximum value in a list.
    
    Args:
        numbers: List of numeric values
        
    Returns:
        The maximum value, or None if empty
    """
    if not numbers:
        return None
    
    max_val = numbers[0]
    for num in numbers:
        if num > max_val:
            max_val = num
    return max_val
EOF

# Get presigned URL for submission
curl -X POST http://localhost:8000/api/v1/uploads/presign \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "submission.txt",
    "content_type": "text/plain",
    "doc_type": "submission",
    "course_id": "'"$COURSE_ID"'",
    "assignment_id": "'"$ASSIGNMENT_ID"'"
  }'

# Upload submission
export SUB_UPLOAD_URL="<upload_url>"
export SUB_FILE_KEY="<file_key>"

curl -X PUT "$SUB_UPLOAD_URL" \
  -H "Content-Type: text/plain" \
  --data-binary @submission.txt

# Confirm and create submission
curl -X POST http://localhost:8000/api/v1/submissions \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assignment_id": "'"$ASSIGNMENT_ID"'",
    "file_name": "submission.txt",
    "file_key": "'"$SUB_FILE_KEY"'",
    "file_size_bytes": 800
  }'

# Save submission_id
export SUBMISSION_ID="<submission_id>"
```

### Step 5: Monitor Evaluation Progress

```bash
# Check Celery logs for processing
# Terminal with celery worker should show:
# - process_document task starting
# - Text extraction, chunking, embedding
# - evaluate_submission task starting
# - Context retrieval, AI evaluation
# - Evaluation created

# Wait for evaluation (check every 10 seconds)
while true; do
  EVAL=$(curl -s http://localhost:8000/api/v1/evaluations/pending \
    -H "Authorization: Bearer $PROF_TOKEN")
  COUNT=$(echo "$EVAL" | jq '. | length')
  echo "Pending evaluations: $COUNT"
  [[ "$COUNT" -gt "0" ]] && break
  sleep 10
done
```

### Step 6: Professor Reviews Evaluation

```bash
# List pending evaluations
curl http://localhost:8000/api/v1/evaluations/pending \
  -H "Authorization: Bearer $PROF_TOKEN" | jq

# Expected output:
# [
#   {
#     "id": "...",
#     "submission_id": "...",
#     "ai_score": 85.0,
#     "approval_status": "pending",
#     "evaluated_at": "2026-06-11T...",
#     "confidence_score": 0.85,
#     "student_name": "Bob Johnson",
#     "student_email": "bob@student.edu",
#     "assignment_title": "Python Functions Assignment"
#   }
# ]

# Save evaluation_id
export EVAL_ID="<evaluation_id>"

# Get full evaluation detail
curl http://localhost:8000/api/v1/evaluations/$EVAL_ID \
  -H "Authorization: Bearer $PROF_TOKEN" | jq

# Expected to see:
# - ai_score, final_score, percentage
# - criteria_scores with per-criterion breakdown
# - strengths, weaknesses, missing_topics
# - retrieved_chunks (for transparency)
# - overall_feedback
```

### Step 7: Approve or Override

**Option A: Approve AI Grade**
```bash
curl -X POST http://localhost:8000/api/v1/evaluations/$EVAL_ID/approve \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "professor_feedback": "Well done! Good use of docstrings."
  }' | jq

# Check approval_status changed to "approved"
# Check final_score equals ai_score
```

**Option B: Override AI Grade**
```bash
curl -X POST http://localhost:8000/api/v1/evaluations/$EVAL_ID/override \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "final_score": 92.5,
    "professor_feedback": "Excellent work with edge cases. Bonus points for thorough documentation."
  }' | jq

# Check approval_status changed to "overridden"
# Check final_score is 92.5 (not ai_score)
```

### Step 8: Student Views Grade

```bash
# Student checks their grade
curl http://localhost:8000/api/v1/evaluations/submission/$SUBMISSION_ID \
  -H "Authorization: Bearer $STUDENT_TOKEN" | jq

# Expected output:
# {
#   "id": "...",
#   "submission_id": "...",
#   "final_score": 92.5,
#   "percentage": 92.5,
#   "strengths": [
#     "Excellent docstrings with clear parameter descriptions",
#     "Proper edge case handling for empty lists",
#     "Clean, readable code following PEP 8"
#   ],
#   "weaknesses": [
#     "Could use more efficient max() built-in instead of manual loop"
#   ],
#   "missing_topics": [],
#   "overall_feedback": "Great submission! Your functions are well-documented...",
#   "criteria_scores": [...]
# }

# Note: Student does NOT see:
# - confidence_score
# - retrieved_chunks
# - Internal AI details
```

---

## Test Scenario 2: Manual Evaluation Trigger

```bash
# Professor manually triggers evaluation
curl -X POST http://localhost:8000/api/v1/evaluations/trigger/$SUBMISSION_ID \
  -H "Authorization: Bearer $PROF_TOKEN" | jq

# Expected output:
# {
#   "message": "Evaluation queued",
#   "submission_id": "...",
#   "task_id": "..."
# }

# Monitor Celery logs for task execution
# Check pending evaluations after 10-30 seconds
```

---

## Test Scenario 3: Error Handling

### Test 1: Document Not Processed Yet
```bash
# Submit and immediately trigger evaluation (before doc processing completes)
curl -X POST http://localhost:8000/api/v1/evaluations/trigger/$NEW_SUBMISSION_ID \
  -H "Authorization: Bearer $PROF_TOKEN"

# Celery should log: "document_still_processing"
# Task should retry after 60 seconds
# Eventually succeeds once document is processed
```

### Test 2: Missing Rubrics
```bash
# Create assignment without rubrics
# Try to evaluate → should fail with clear error:
# "Cannot evaluate: no rubrics defined for this assignment"
```

### Test 3: ChromaDB Collection Missing
```bash
# Create brand new course with no uploaded documents
# Student submits → evaluation proceeds with empty context
# AI evaluates with just rubrics from database (no vector context)
# Works, but may have lower confidence score
```

### Test 4: Gemini API Error
```bash
# Set invalid GEMINI_API_KEY in .env
# Restart backend
# Try evaluation → task retries 3 times
# Falls back to 50% scores with message:
# "Automatic evaluation failed. Manual grading required."
```

---

## Test Scenario 4: Access Control

### Test 1: Student Can't View Other Student's Grade
```bash
# Try to access another student's evaluation
curl http://localhost:8000/api/v1/evaluations/submission/$OTHER_SUBMISSION_ID \
  -H "Authorization: Bearer $STUDENT_TOKEN"

# Expected: 404 Not Found
```

### Test 2: Student Can't View Pending Evaluation
```bash
# Try to view evaluation before professor approval
curl http://localhost:8000/api/v1/evaluations/submission/$SUBMISSION_ID \
  -H "Authorization: Bearer $STUDENT_TOKEN"

# Expected: 404 "No approved evaluation found"
```

### Test 3: Professor Can't Approve Other Professor's Course
```bash
# Create second professor
# Try to approve evaluation from first professor's course
curl -X POST http://localhost:8000/api/v1/evaluations/$EVAL_ID/approve \
  -H "Authorization: Bearer $OTHER_PROF_TOKEN"

# Expected: 403 Forbidden
```

---

## Verification Checklist

### Database Checks

```sql
-- Check evaluation record
SELECT 
    e.id,
    e.submission_id,
    e.ai_score,
    e.final_score,
    e.approval_status,
    e.confidence_score,
    s.student_id,
    u.name as student_name
FROM evaluations e
JOIN submissions s ON e.submission_id = s.id
JOIN users u ON s.student_id = u.id
ORDER BY e.created_at DESC
LIMIT 5;

-- Check ai_feedback structure
SELECT 
    id,
    ai_feedback->'criteria_scores' as criteria,
    ai_feedback->'confidence_score' as confidence,
    jsonb_array_length(strengths) as strength_count,
    jsonb_array_length(weaknesses) as weakness_count
FROM evaluations
WHERE id = '<evaluation_id>';

-- Check retrieved_chunks
SELECT 
    id,
    jsonb_array_length(retrieved_chunks) as chunk_count,
    retrieved_chunks->0->'source_name' as first_source
FROM evaluations
WHERE id = '<evaluation_id>';
```

### ChromaDB Checks

```bash
# List collections
curl http://localhost:8001/api/v1/collections | jq

# Get collection details
curl http://localhost:8001/api/v1/collections/gradeai_$COURSE_ID | jq

# Should see documents with metadata:
# - doc_type: rubric, notes, submission
# - document_id, course_id, assignment_id
```

### Celery Checks

```bash
# Check active tasks
celery -A app.celery_app inspect active

# Check task history
celery -A app.celery_app inspect stats

# Check failed tasks
celery -A app.celery_app inspect registered
```

---

## Performance Testing

### Measure Evaluation Time

```bash
# Time the full evaluation
START=$(date +%s)
curl -X POST http://localhost:8000/api/v1/evaluations/trigger/$SUBMISSION_ID \
  -H "Authorization: Bearer $PROF_TOKEN"

# Wait for evaluation to complete
while true; do
  STATUS=$(curl -s http://localhost:8000/api/v1/evaluations/pending \
    -H "Authorization: Bearer $PROF_TOKEN" | jq '. | length')
  [[ "$STATUS" -gt "0" ]] && break
  sleep 2
done

END=$(date +%s)
DURATION=$((END - START))
echo "Evaluation completed in $DURATION seconds"

# Expected: 7-30 seconds (depends on doc size, context size)
```

### Batch Test

```bash
# Submit 10 submissions in parallel
for i in {1..10}; do
  (
    # Create submission
    # Trigger evaluation
  ) &
done
wait

# Check Celery can handle load
# All evaluations should complete within 2 minutes
```

---

## Troubleshooting

### Issue: Evaluation Stuck in "evaluating" Status

**Check**:
```bash
# Celery worker running?
ps aux | grep celery

# Task in queue?
celery -A app.celery_app inspect active

# Document processed?
curl http://localhost:8000/api/v1/documents/$DOC_ID/status
```

**Fix**:
- Restart Celery worker
- Check document parse_status
- Check Celery logs for errors

### Issue: Low Confidence Scores

**Check**:
- Are rubrics uploaded and processed?
- Are course notes uploaded?
- Is ChromaDB collection populated?

**Verify**:
```bash
# Check collection size
curl http://localhost:8001/api/v1/collections/gradeai_$COURSE_ID | jq '.metadata'

# Check retrieved_chunks in evaluation
curl http://localhost:8000/api/v1/evaluations/$EVAL_ID | jq '.retrieved_chunks'
```

### Issue: Gemini API Errors

**Check**:
```bash
# API key valid?
echo $GEMINI_API_KEY

# Rate limit hit?
# Check error message in Celery logs

# Quota exceeded?
# Check Google Cloud Console
```

**Fix**:
- Verify API key in .env
- Wait if rate limited
- Upgrade quota if needed

---

## Success Criteria

✅ **Phase 4 Complete When**:

1. Student can submit assignment
2. Document is automatically processed (Phase 3B)
3. AI evaluation is automatically triggered
4. Evaluation appears in professor's pending list
5. Professor can view full evaluation details
6. Professor can approve or override grade
7. Student can view approved grade
8. All security checks pass
9. Error handling works correctly
10. Performance is acceptable (< 30s total)

---

## Next Steps

After Phase 4 testing:
- Phase 5: Analytics Dashboard
- Phase 6: Frontend grading interface
- Production deployment
- Monitoring and optimization

