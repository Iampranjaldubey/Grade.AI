# Phase 4 Quick Reference - AI Evaluation

## API Endpoints Cheat Sheet

### Professor Endpoints

```bash
# List pending evaluations (sorted by confidence, lowest first)
GET /api/v1/evaluations/pending?course_id={optional}
Authorization: Bearer {professor_token}

Response: [
  {
    "id": "uuid",
    "submission_id": "uuid",
    "ai_score": 85.0,
    "confidence_score": 0.82,
    "student_name": "Bob Johnson",
    "student_email": "bob@student.edu",
    "assignment_title": "Python Functions",
    "evaluated_at": "2026-06-11T...",
    "approval_status": "pending"
  }
]

# Get evaluation details
GET /api/v1/evaluations/{evaluation_id}
Authorization: Bearer {professor_token}

Response: {
  "id": "uuid",
  "ai_score": 85.0,
  "final_score": null,
  "ai_feedback": {
    "criteria_scores": [...],
    "confidence_score": 0.82,
    "percentage": 85.0
  },
  "strengths": ["...", "...", "..."],
  "weaknesses": ["...", "..."],
  "missing_topics": [],
  "retrieved_chunks": [...],
  "approval_status": "pending"
}

# Approve AI grade
POST /api/v1/evaluations/{evaluation_id}/approve
Authorization: Bearer {professor_token}
Content-Type: application/json

{
  "professor_feedback": "Great work!" // optional
}

Response: EvaluationOut (final_score = ai_score, status = approved)

# Override AI grade
POST /api/v1/evaluations/{evaluation_id}/override
Authorization: Bearer {professor_token}
Content-Type: application/json

{
  "final_score": 92.5,
  "professor_feedback": "Bonus for extra credit", // required
  "criteria_overrides": [...] // optional
}

Response: EvaluationOut (final_score = 92.5, status = overridden)

# Manually trigger evaluation
POST /api/v1/evaluations/trigger/{submission_id}
Authorization: Bearer {professor_token}

Response: {
  "message": "Evaluation queued",
  "submission_id": "uuid",
  "task_id": "celery-task-id"
}
```

### Student Endpoints

```bash
# View own grade (only approved/overridden)
GET /api/v1/evaluations/submission/{submission_id}
Authorization: Bearer {student_token}

Response: {
  "id": "uuid",
  "submission_id": "uuid",
  "final_score": 85.0,
  "percentage": 85.0,
  "strengths": ["...", "...", "..."],
  "weaknesses": ["...", "..."],
  "missing_topics": [],
  "overall_feedback": "Great submission...",
  "criteria_scores": [
    {
      "criterion_name": "Code Correctness",
      "awarded": 36,
      "max": 40,
      "reasoning": "Functions work correctly..."
    }
  ],
  "evaluated_at": "2026-06-11T...",
  "approved_at": "2026-06-11T..."
}

# Returns 404 if:
# - Evaluation doesn't exist
# - Evaluation is still pending (not approved yet)
# - Submission belongs to another student
```

---

## Code Usage Examples

### Trigger Evaluation in Code

```python
from app.tasks.grading import evaluate_submission

# Queue evaluation task
task = evaluate_submission.delay(str(submission_id))

# Get task ID
print(f"Task ID: {task.id}")

# Wait for result (blocking)
result = task.get(timeout=60)
print(result)
# {'submission_id': '...', 'status': 'evaluated', 'total_score': 85.0}
```

### Use Retrieval Service

```python
from app.rag.retrieval import RetrievalService
from app.rag.embeddings import embedding_service
from app.infrastructure.chromadb_client import ChromaDBClient
from app.core.config import get_settings

settings = get_settings()
chroma = ChromaDBClient(settings)
chroma.connect()

retrieval_service = RetrievalService(chroma, embedding_service)

# Retrieve context for grading
result = retrieval_service.retrieve_context(
    submission_text="def calculate_average...",
    assignment_id=assignment_id,
    course_id=course_id,
    db_session=db  # sync session
)

print(f"Rubric chunks: {len(result.rubric_chunks)}")
print(f"Notes chunks: {len(result.notes_chunks)}")
print(f"Sample chunks: {len(result.sample_chunks)}")
print(f"Token estimate: {result.total_token_estimate}")
```

### Use AI Evaluator

```python
from app.rag.evaluator import GradingEvaluator
from app.core.config import get_settings

settings = get_settings()
evaluator = GradingEvaluator(settings)

# Evaluate submission
eval_result = evaluator.evaluate(
    submission_text="def calculate_average...",
    rubrics=rubrics,  # List[Rubric]
    retrieval_result=retrieval_result,
    assignment=assignment,
)

print(f"Total score: {eval_result.total_score}/{eval_result.max_score}")
print(f"Percentage: {eval_result.percentage}%")
print(f"Confidence: {eval_result.confidence_score}")
print(f"Strengths: {eval_result.strengths}")
print(f"Weaknesses: {eval_result.weaknesses}")
```

---

## Database Queries

```sql
-- Find pending evaluations for a professor
SELECT 
    e.id,
    e.ai_score,
    e.ai_feedback->>'confidence_score' as confidence,
    s.assignment_id,
    u.name as student_name,
    a.title as assignment_title
FROM evaluations e
JOIN submissions s ON e.submission_id = s.id
JOIN users u ON s.student_id = u.id
JOIN assignments a ON s.assignment_id = a.id
JOIN courses c ON a.course_id = c.id
WHERE c.professor_id = '<professor_uuid>'
  AND e.approval_status = 'pending'
ORDER BY (e.ai_feedback->>'confidence_score')::float ASC;

-- Get evaluation details
SELECT 
    e.*,
    s.student_id,
    u.name as student_name,
    a.title as assignment_title,
    a.max_score
FROM evaluations e
JOIN submissions s ON e.submission_id = s.id
JOIN users u ON s.student_id = u.id
JOIN assignments a ON s.assignment_id = a.id
WHERE e.id = '<evaluation_uuid>';

-- Check evaluation counts by status
SELECT 
    approval_status,
    COUNT(*) as count,
    AVG(ai_score) as avg_score,
    AVG((ai_feedback->>'confidence_score')::float) as avg_confidence
FROM evaluations
GROUP BY approval_status;

-- Find low-confidence evaluations
SELECT 
    e.id,
    e.ai_score,
    e.ai_feedback->>'confidence_score' as confidence,
    u.name as student_name
FROM evaluations e
JOIN submissions s ON e.submission_id = s.id
JOIN users u ON s.student_id = u.id
WHERE e.approval_status = 'pending'
  AND (e.ai_feedback->>'confidence_score')::float < 0.7
ORDER BY (e.ai_feedback->>'confidence_score')::float ASC;
```

---

## Celery Commands

```bash
# Start worker
celery -A app.celery_app worker --loglevel=info

# Check active tasks
celery -A app.celery_app inspect active

# Check registered tasks
celery -A app.celery_app inspect registered

# Check stats
celery -A app.celery_app inspect stats

# Purge all tasks
celery -A app.celery_app purge

# Monitor in real-time
celery -A app.celery_app events
```

---

## ChromaDB Queries

```bash
# List all collections
curl http://localhost:8001/api/v1/collections

# Get collection info
curl http://localhost:8001/api/v1/collections/gradeai_{course_id}

# Check collection count
curl http://localhost:8001/api/v1/collections/gradeai_{course_id}/count
```

---

## Common Workflows

### Workflow 1: Approve All High-Confidence Evaluations

```python
import requests

# Get pending evaluations
response = requests.get(
    "http://localhost:8000/api/v1/evaluations/pending",
    headers={"Authorization": f"Bearer {token}"}
)
evaluations = response.json()

# Approve all with confidence > 0.85
for eval in evaluations:
    if eval['confidence_score'] > 0.85:
        requests.post(
            f"http://localhost:8000/api/v1/evaluations/{eval['id']}/approve",
            headers={"Authorization": f"Bearer {token}"},
            json={"professor_feedback": "Auto-approved (high confidence)"}
        )
        print(f"Approved: {eval['student_name']}")
```

### Workflow 2: Re-evaluate All Submissions for an Assignment

```python
from app.tasks.grading import evaluate_submission
from app.models.submission import Submission
from app.db.sync_session import get_sync_db

with get_sync_db() as db:
    submissions = db.query(Submission).filter(
        Submission.assignment_id == assignment_id
    ).all()
    
    for submission in submissions:
        task = evaluate_submission.delay(str(submission.id))
        print(f"Queued: {submission.id} -> Task {task.id}")
```

### Workflow 3: Export Evaluation Report

```python
import csv
from app.models.evaluation import Evaluation
from app.db.sync_session import get_sync_db

with get_sync_db() as db:
    evals = db.query(Evaluation).join(
        Submission
    ).filter(
        Submission.assignment_id == assignment_id
    ).all()
    
    with open('grades.csv', 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['Student', 'AI Score', 'Final Score', 'Status'])
        
        for e in evals:
            writer.writerow([
                e.submission.student.name,
                e.ai_score,
                e.final_score or e.ai_score,
                e.approval_status
            ])
```

---

## Environment Variables

```bash
# Required
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL=gemini-2.0-flash

# ChromaDB
CHROMADB_HOST=localhost
CHROMADB_PORT=8001

# Database
DATABASE_URL=postgresql+asyncpg://gradeai:gradeai@localhost:5432/gradeai
DATABASE_URL_SYNC=postgresql://gradeai:gradeai@localhost:5432/gradeai

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2
```

---

## Approval Status Flow

```
┌─────────┐
│ PENDING │  ← AI evaluation created
└────┬────┘
     │
     ├─────────────┐
     │             │
     ▼             ▼
┌──────────┐  ┌────────────┐
│ APPROVED │  │ OVERRIDDEN │  ← Final states
└──────────┘  └────────────┘

PENDING → APPROVED: final_score = ai_score
PENDING → OVERRIDDEN: final_score = professor's manual score
```

---

## Error Codes

- `404` - Evaluation/submission not found
- `403` - Not authorized (wrong course/student)
- `400` - Invalid request (score > max, already approved, etc.)
- `500` - Server error (AI API down, DB error, etc.)

---

## Performance Benchmarks

| Operation | Typical Time |
|-----------|--------------|
| Retrieval | 300-500ms |
| AI Eval | 2-6 seconds |
| Total | 7-26 seconds |
| Approve | <100ms |
| Override | <100ms |

---

## Troubleshooting

**Evaluation not appearing in pending list?**
- Check Celery worker is running
- Check document parse_status is "success"
- Check task logs for errors

**Low confidence scores?**
- Upload more course notes
- Upload sample solutions
- Verify rubrics are detailed

**Gemini API errors?**
- Check API key is valid
- Check rate limits not exceeded
- Check quota in Google Cloud Console

**Student can't see grade?**
- Check approval_status (must be approved/overridden)
- Check student owns the submission
- Check evaluation exists

---

## Next Steps

1. Test with real submissions
2. Monitor confidence scores
3. Adjust rubrics if needed
4. Build frontend grading interface (Phase 5)
5. Add analytics dashboard (Phase 6)

