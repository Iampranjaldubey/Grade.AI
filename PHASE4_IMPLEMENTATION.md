# Phase 4 Implementation - AI Evaluation Engine

## Overview

Phase 4 implements the complete AI-powered grading and evaluation system for GradeAI. This phase uses RAG (Retrieval-Augmented Generation) with Google Gemini to automatically evaluate student submissions based on rubrics and course materials.

## Architecture

```
Student Submission → Document Processing (Phase 3B) → AI Evaluation (Phase 4) → Professor Review → Final Grade
                                                      ↑
                                                ChromaDB Context
                                                (Rubrics, Notes, Samples)
```

## Components Implemented

### 1. RAG Retrieval Service (`backend/app/rag/retrieval.py`)

**Purpose**: Fetches relevant context from ChromaDB for AI grading.

**Key Classes**:
- `RetrievedChunk`: Dataclass representing a single chunk with metadata
  - `chunk_text`: The actual text content
  - `document_id`: Source document UUID
  - `doc_type`: Type (rubric/notes/sample_solution/submission)
  - `relevance_score`: Distance metric from ChromaDB (lower = more relevant)
  - `chunk_index`: Position in original document
  - `source_name`: Original filename for citation

- `RetrievalResult`: Complete context package for evaluation
  - `rubric_chunks`: ALL rubric chunks (rubric must be complete)
  - `notes_chunks`: Top 5 most relevant course notes
  - `sample_chunks`: Top 3 most relevant sample solution excerpts
  - `total_token_estimate`: Rough token count for LLM context

- `RetrievalService`: Main service class
  - `retrieve_context()`: Main method that orchestrates all retrieval
  - `_query_collection()`: Private method for querying ChromaDB with filters

**Retrieval Strategy**:
1. **Rubrics** (n_results=50): Get ALL rubric chunks for the assignment
   - Filter: `doc_type=rubric AND assignment_id=<id>`
   - Why 50? Ensures complete rubric is included
   
2. **Course Notes** (n_results=5): Get most semantically similar notes
   - Filter: `doc_type=notes AND course_id=<id>`
   - Uses submission text embedding for similarity search
   
3. **Sample Solutions** (n_results=3): Get relevant sample excerpts
   - Filter: `doc_type=sample_solution AND assignment_id=<id>`
   - Uses submission text embedding for similarity search

**Error Handling**:
- Gracefully handles missing collections (returns empty results)
- Logs all queries for debugging
- Never crashes - returns empty list on errors

---

### 2. AI Evaluator (`backend/app/rag/evaluator.py`)

**Purpose**: Uses Google Gemini to grade submissions with RAG context.

**Key Classes**:
- `EvaluationResult`: Structured AI evaluation output
  - `total_score`: Sum of all criterion scores
  - `max_score`: Maximum possible score
  - `percentage`: (total_score / max_score) * 100
  - `criteria_scores`: List of dicts with per-criterion breakdown
  - `strengths`: Top 3 positive aspects (with examples)
  - `weaknesses`: Top 3 areas for improvement
  - `missing_topics`: Topics required by rubric but not addressed
  - `overall_feedback`: 3-4 sentence summary
  - `confidence_score`: AI's confidence in evaluation (0.0-1.0)
  - `retrieved_sources`: List of source filenames used

- `GradingEvaluator`: Main evaluator class
  - `evaluate()`: Main evaluation method
  - `_build_system_prompt()`: Creates system instructions for Gemini
  - `_build_user_prompt()`: Creates detailed grading prompt with all context
  - `_parse_response()`: Parses and validates JSON response
  - `_retry_evaluation()`: Fallback with simplified prompt
  - `_create_fallback_evaluation()`: Safety net when AI fails

**Gemini Configuration**:
```python
Model: gemini-2.0-flash
Temperature: 0.1  # Low for consistent grading
Max Output Tokens: 4096
```

**Prompt Structure**:
```
=== SYSTEM PROMPT ===
You are an expert academic evaluator...
(Guidelines for fair, specific, evidence-based grading)

=== USER PROMPT ===
=== ASSIGNMENT ===
Title, Description, Max Score, Grading Mode

=== GRADING RUBRIC ===
For each criterion:
- Name, Weight, Max Points
- Description
- Evaluation Hints

=== RELEVANT COURSE MATERIAL ===
Top 5 course notes chunks with source citations

=== SAMPLE SOLUTION EXCERPTS ===
Top 3 sample solution chunks

=== STUDENT SUBMISSION ===
<student_answer>
{submission_text}
</student_answer>

=== EVALUATION INSTRUCTIONS ===
Return ONLY valid JSON with exact schema...
```

**Response Parsing**:
- Strips markdown code blocks (```json)
- Validates required fields
- Ensures total_score ≤ max_score
- Retries once on parse failure
- Falls back to 50% scores if all else fails

---

### 3. Evaluation Task (`backend/app/tasks/grading.py`)

**Celery Task**: `evaluate_submission(submission_id)`

**Pipeline**:
1. **Load Data** (from PostgreSQL):
   - Submission record
   - Assignment with course_id
   - All rubrics for assignment
   - Document with parsed text

2. **Check Document Status**:
   - If `parse_status != SUCCESS`: retry after 60s (max 5 retries)
   - If `parse_status == FAILED`: fail immediately
   - If `parsed_text` is None: fail

3. **Retrieve Context** (from ChromaDB):
   - Call `RetrievalService.retrieve_context()`
   - Gets rubrics, notes, samples

4. **Evaluate with AI** (Gemini API):
   - Call `GradingEvaluator.evaluate()`
   - Gets structured evaluation result

5. **Store Evaluation** (in PostgreSQL):
   - Create or update `Evaluation` record
   - Set `approval_status = PENDING`
   - Store all feedback, scores, chunks
   - Update `submission.status = EVALUATED`

**Retry Logic**:
- Max retries: 3
- Exponential backoff: 60s, 120s, 240s
- Retries on transient errors (API timeouts, DB locks)
- Does not retry on permanent failures (missing data, parse failed)

**Data Stored**:
```python
Evaluation(
    submission_id=uuid,
    ai_score=Decimal,
    ai_feedback={
        "criteria_scores": [...],
        "percentage": float,
        "confidence_score": float,
    },
    strengths=[...],
    weaknesses=[...],
    missing_topics=[...],
    retrieved_chunks=[...],  # For transparency
    approval_status="pending",
    evaluated_at=datetime.utcnow(),
)
```

---

### 4. Evaluation Schemas (`backend/app/schemas/evaluation.py`)

**Response Models**:
- `EvaluationOut`: Full evaluation (for professors)
- `EvaluationListOut`: Summary for pending review list
- `StudentEvaluationOut`: Limited view for students (no internal data)
- `CriteriaScoreOut`: Individual criterion breakdown

**Request Models**:
- `ApproveEvaluationRequest`: Optional professor feedback
- `OverrideEvaluationRequest`: Manual score + required feedback + optional criteria adjustments

**Properties**:
- `confidence_score`, `criteria_scores`, `percentage` extracted from `ai_feedback` JSONB

---

### 5. Evaluation API Endpoints (`backend/app/api/v1/endpoints/evaluations.py`)

#### Professor Endpoints

**GET `/api/v1/evaluations/pending`**
- Lists pending evaluations for professor's courses
- Sorted by confidence_score ASC (lowest confidence first = needs most review)
- Optional `course_id` filter
- Returns: `List[EvaluationListOut]`
- Includes: student name, email, assignment title, AI score, confidence

**GET `/api/v1/evaluations/{evaluation_id}`**
- Full evaluation details
- Includes all criteria scores, retrieved chunks, feedback
- Includes submission file_url for download
- Returns: `EvaluationOut`

**POST `/api/v1/evaluations/{evaluation_id}/approve`**
- Approves AI evaluation without changes
- Sets `final_score = ai_score`
- Sets `approval_status = APPROVED`
- Optional professor feedback
- Returns: `EvaluationOut`

**POST `/api/v1/evaluations/{evaluation_id}/override`**
- Overrides AI evaluation with manual grading
- Requires `final_score` and `professor_feedback`
- Validates `final_score ≤ assignment.max_score`
- Sets `approval_status = OVERRIDDEN`
- Optional per-criterion adjustments
- Returns: `EvaluationOut`

**POST `/api/v1/evaluations/trigger/{submission_id}`**
- Manually triggers AI evaluation
- Useful for re-evaluation or failed submissions
- Queues Celery task
- Returns: task_id and submission_id

#### Student Endpoints

**GET `/api/v1/evaluations/submission/{submission_id}`**
- Student views their own approved grade
- Only returns if `approval_status` is APPROVED or OVERRIDDEN
- Limited fields (no confidence_score, retrieved_chunks, etc.)
- Returns: `StudentEvaluationOut`

---

## Database Schema

### Evaluations Table (already exists)

```sql
CREATE TABLE evaluations (
    id UUID PRIMARY KEY,
    submission_id UUID UNIQUE NOT NULL REFERENCES submissions(id),
    ai_score NUMERIC(10, 2) NOT NULL,
    final_score NUMERIC(10, 2),
    ai_feedback JSONB,  -- criteria_scores, percentage, confidence_score
    professor_feedback TEXT,
    strengths JSONB,  -- List[str]
    weaknesses JSONB,  -- List[str]
    missing_topics JSONB,  -- List[str]
    retrieved_chunks JSONB,  -- List[RetrievedChunk]
    approved_by UUID REFERENCES users(id),
    approval_status approval_status_enum DEFAULT 'pending',
    evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_evaluations_submission ON evaluations(submission_id);
CREATE INDEX idx_evaluations_approval_status ON evaluations(approval_status);
CREATE INDEX idx_evaluations_evaluated_at ON evaluations(evaluated_at);
```

---

## Workflow

### Automatic Evaluation Flow

```
1. Student submits file → POST /api/v1/submissions
2. Submission created → process_document.delay() triggered
3. Document processed → evaluate_submission.delay() triggered (auto)
4. AI evaluates → Evaluation record created (status=pending)
5. Professor reviews → GET /api/v1/evaluations/pending
6. Professor approves/overrides → POST /evaluations/{id}/approve or /override
7. Student views grade → GET /api/v1/evaluations/submission/{id}
```

### Manual Evaluation Flow

```
1. Professor triggers → POST /api/v1/evaluations/trigger/{submission_id}
2. Same as steps 4-7 above
```

---

## Security & Access Control

**Professor Routes**:
- List pending: Only professor's own courses
- View detail: Verify course ownership
- Approve/Override: Verify course ownership
- Trigger: Verify course ownership

**Student Routes**:
- View grade: Only own submissions
- Only approved/overridden evaluations visible
- No internal fields (confidence, chunks, etc.)

**Data Protection**:
- `approval_status` prevents premature grade release
- `retrieved_chunks` stored for transparency/auditing
- Professor can see AI reasoning and context

---

## Error Handling

**Retrieval Errors**:
- Missing collection → return empty results (don't crash)
- ChromaDB down → return empty results (logged)
- Document not found → return empty source_name

**Evaluation Errors**:
- Gemini API timeout → retry with exponential backoff
- Invalid JSON response → retry once with simplified prompt
- Parse failure after retry → fallback evaluation (50% scores)
- Fallback includes message: "Automatic evaluation failed. Manual grading required."

**Task Errors**:
- Document not processed → retry after 60s (max 5 retries)
- Document parse failed → fail immediately (no retries)
- Missing rubrics → fail with clear error message
- Database errors → retry with exponential backoff

---

## Configuration

**Environment Variables**:
```bash
GEMINI_API_KEY=<your-api-key>
GEMINI_MODEL=gemini-2.0-flash  # or gemini-1.5-pro
CHROMADB_HOST=localhost
CHROMADB_PORT=8001
```

**Dependencies** (already in requirements.txt):
```
google-generativeai>=0.8.0
chromadb==0.5.23
sentence-transformers==3.0.0
```

---

## Testing

### Manual API Testing

**1. Trigger Evaluation**:
```bash
curl -X POST http://localhost:8000/api/v1/evaluations/trigger/{submission_id} \
  -H "Authorization: Bearer {professor_token}"
```

**2. List Pending**:
```bash
curl http://localhost:8000/api/v1/evaluations/pending \
  -H "Authorization: Bearer {professor_token}"
```

**3. View Detail**:
```bash
curl http://localhost:8000/api/v1/evaluations/{evaluation_id} \
  -H "Authorization: Bearer {professor_token}"
```

**4. Approve**:
```bash
curl -X POST http://localhost:8000/api/v1/evaluations/{evaluation_id}/approve \
  -H "Authorization: Bearer {professor_token}" \
  -H "Content-Type: application/json" \
  -d '{"professor_feedback": "Good work!"}'
```

**5. Override**:
```bash
curl -X POST http://localhost:8000/api/v1/evaluations/{evaluation_id}/override \
  -H "Authorization: Bearer {professor_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "final_score": 85.5,
    "professor_feedback": "Adjusted for extra credit"
  }'
```

**6. Student View**:
```bash
curl http://localhost:8000/api/v1/evaluations/submission/{submission_id} \
  -H "Authorization: Bearer {student_token}"
```

### Celery Task Testing

**Monitor Celery**:
```bash
celery -A app.celery_app inspect active
celery -A app.celery_app inspect stats
```

**Test Evaluation Task**:
```python
from app.tasks.grading import evaluate_submission
result = evaluate_submission.delay(str(submission_id))
print(result.get())  # Wait for result
```

---

## Performance Considerations

**Retrieval**:
- Embedding generation: ~50ms per query
- ChromaDB query: ~100ms per collection
- Total retrieval: ~300-500ms

**AI Evaluation**:
- Gemini API call: 2-5 seconds (varies with input size)
- JSON parsing: <10ms
- Total evaluation: 2-6 seconds

**End-to-End**:
- Document processing: 5-20 seconds (Phase 3B)
- AI evaluation: 2-6 seconds (Phase 4)
- Total: 7-26 seconds from upload to evaluation

**Optimization**:
- Celery handles async processing (doesn't block API)
- ChromaDB indexing is fast (384-dim vectors)
- Low temperature (0.1) ensures consistent output

---

## Monitoring & Logging

**Structured Logs**:
- `evaluate_submission_started`
- `submission_loaded`
- `context_retrieved`
- `ai_evaluation_completed`
- `evaluation_created`
- `evaluation_approved`
- `evaluation_overridden`

**Metrics to Track**:
- Evaluation success rate
- Average confidence score
- Override rate (how often professors disagree)
- Processing time per evaluation
- Gemini API errors

---

## Future Enhancements

**Phase 4.1** (Optional):
- Batch evaluation for multiple submissions
- Custom rubric weights per assignment
- Multi-model fallback (Gemini → GPT-4)
- Evaluation quality metrics
- A/B testing different prompts

**Phase 4.2** (Optional):
- Peer review suggestions
- Plagiarism detection integration
- Code execution for programming assignments
- Multi-language support

---

## Completion Checklist

- [x] `backend/app/rag/retrieval.py` - RAG retrieval service
- [x] `backend/app/rag/evaluator.py` - Gemini evaluator
- [x] `backend/app/tasks/grading.py` - Celery evaluation task (already updated)
- [x] `backend/app/schemas/evaluation.py` - Evaluation schemas
- [x] `backend/app/api/v1/endpoints/evaluations.py` - API endpoints
- [x] `backend/app/api/v1/router.py` - Router registration (already done)
- [x] `backend/app/schemas/__init__.py` - Schema exports
- [x] `requirements.txt` - Dependencies (already has google-generativeai)

---

## Summary

Phase 4 completes the AI evaluation pipeline:
- ✅ RAG-based context retrieval from ChromaDB
- ✅ Google Gemini integration for grading
- ✅ Structured evaluation with rubric adherence
- ✅ Professor review workflow (approve/override)
- ✅ Student grade viewing
- ✅ Manual evaluation trigger
- ✅ Comprehensive error handling
- ✅ Full audit trail with retrieved_chunks

Students can now submit work, receive AI-powered feedback, and see their grades after professor approval!
