# Retrieved Sources Usage Investigation

**Date**: August 15, 2026  
**Purpose**: Trace whether `retrieved_chunks` stored in Evaluation is ever used by API or frontend  
**Status**: ✅ **INVESTIGATION COMPLETE**

---

## Executive Summary

**Finding**: `retrieved_chunks` is **stored in the database but NEVER exposed to API consumers or rendered in the frontend**.

- ✅ **Stored**: Yes, in `evaluations.retrieved_chunks` column (JSONB)
- ❌ **API Exposed**: No, excluded from all Pydantic response schemas
- ❌ **Frontend Used**: No, zero references in frontend codebase

**Conclusion**: `retrieved_chunks` is **write-only audit data** - stored for debugging/forensics but never displayed to users.

---

## 1. Database Storage

### Model Definition
**File**: `backend/app/models/evaluation.py` (line 42)

```python
retrieved_chunks: Mapped[list[Any] | None] = mapped_column(FlexibleJSON, nullable=True)
```

✅ **Column exists**: JSONB type, nullable

---

### Data Written

**File**: `backend/app/tasks/grading.py` (lines 207-221, 250-265)

#### When Creating New Evaluation (lines 250-265)
```python
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
```

#### When Updating Existing Evaluation (lines 207-221)
```python
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
```

**Data Structure**: Array of objects with:
- `chunk_text`: The full chunk content
- `document_id`: UUID of source document
- `doc_type`: "rubric" / "notes" / "sample_solution"
- `relevance_score`: Similarity distance from query
- `source_name`: Document file name

**Size**: With new fix (n_results=5 for rubrics):
- Rubric: 5 chunks
- Notes: 5 chunks
- Sample: 3 chunks
- **Total**: ~13 chunks per evaluation

**Before fix**: ~58 chunks (50 rubric + 5 notes + 3 sample) - **10x larger!**

---

### Manual Evaluation
**File**: `backend/app/api/v1/endpoints/evaluations.py` (line 372)

```python
evaluation = Evaluation(
    submission_id=submission_id,
    ai_score=None,
    final_score=request.final_score,
    professor_feedback=request.professor_feedback,
    # ...
    retrieved_chunks=None,  # ← Explicitly set to None for manual grading
)
```

**Behavior**: Manual evaluations have `retrieved_chunks=None` (no RAG retrieval happened)

---

## 2. API Response Schemas

**File**: `backend/app/schemas/evaluation.py`

### Schemas Checked

#### EvaluationOut (lines 21-64) - Primary Response Schema
```python
class EvaluationOut(BaseModel):
    """Complete evaluation response."""
    id: UUID
    submission_id: UUID
    ai_score: Optional[Decimal] = None
    final_score: Optional[Decimal] = None
    ai_feedback: Optional[dict[str, Any]] = None
    professor_feedback: Optional[str] = None
    strengths: Optional[list[str]] = None
    weaknesses: Optional[list[str]] = None
    missing_topics: Optional[list[str]] = None
    approval_status: ApprovalStatus
    evaluated_at: datetime
    approved_at: Optional[datetime] = None
    
    # No retrieved_chunks field ←
```

❌ **NOT INCLUDED**: `retrieved_chunks` is absent

---

#### EvaluationListOut (lines 67-79) - List View
```python
class EvaluationListOut(BaseModel):
    """Evaluation list item for professor's pending reviews."""
    id: UUID
    submission_id: UUID
    ai_score: Optional[Decimal] = None
    approval_status: ApprovalStatus
    evaluated_at: datetime
    confidence_score: float
    student_name: str
    student_email: str
    assignment_title: str
    
    # No retrieved_chunks field ←
```

❌ **NOT INCLUDED**

---

#### StudentEvaluationOut (lines 125-140) - Student View
```python
class StudentEvaluationOut(BaseModel):
    """Evaluation view for students (limited fields)."""
    id: UUID
    submission_id: UUID
    final_score: Decimal
    percentage: float
    strengths: Optional[list[str]] = None
    weaknesses: Optional[list[str]] = None
    missing_topics: Optional[list[str]] = None
    overall_feedback: str
    criteria_scores: list[dict[str, Any]]
    evaluated_at: datetime
    approved_at: Optional[datetime] = None
    
    # No retrieved_chunks field ←
```

❌ **NOT INCLUDED**

---

### Conclusion: API Level

**Search Query**: `retrieved_chunks|retrieved_sources` in `backend/app/schemas/evaluation.py`

**Result**: **ZERO matches**

**Behavior**: All API endpoints that return evaluations use these schemas, which means:
- `retrieved_chunks` is **never serialized** to JSON responses
- Professors see evaluations **without** source attribution
- Students see evaluations **without** knowing what documents were consulted

---

## 3. Frontend Usage

### Search Performed
**Pattern**: `retrieved_chunks|retrieved_sources|retrievedChunks|retrievedSources`  
**Scope**: `frontend/src/**/*.{ts,tsx,js,jsx}`

**Result**: **ZERO matches**

### Conclusion: Frontend Level

The frontend codebase has:
- ❌ No TypeScript interfaces referencing `retrievedChunks` or `retrievedSources`
- ❌ No components rendering retrieved source information
- ❌ No API calls requesting this data
- ❌ No UI displaying "Sources Consulted" or similar

**Behavior**: Even if the API were to return `retrieved_chunks`, the frontend would ignore it.

---

## 4. Complete Data Flow

### Current State (After Fix)

```
1. Grading Task (grading.py)
   ↓
   Retrieve 5 rubric + 5 notes + 3 sample chunks
   ↓
2. Store in Database (Evaluation.retrieved_chunks column)
   ↓
   [JSONB data sits in database]
   ↓
3. API Response (evaluations.py endpoints)
   ↓
   Pydantic schemas EXCLUDE retrieved_chunks
   ↓
4. Frontend (React)
   ↓
   Never requests or renders this data
   ↓
   [END - Data never seen by users]
```

### Potential Use Case (Hypothetical)

If someone wanted to access `retrieved_chunks`, they would need to:
1. **Database Query**: Direct SQL query to `evaluations.retrieved_chunks`
2. **Admin Tool**: Internal debugging dashboard
3. **Audit/Forensics**: Post-mortem analysis of AI grading decisions

**Current Access Method**: Only via raw database access (SQL query)

---

## 5. Comparison: Before vs. After Fix

| Metric | Before Fix (n=50) | After Fix (n=5) | Change |
|--------|-------------------|-----------------|--------|
| **Rubric chunks stored** | 50 | 5 | -90% |
| **Total chunks stored** | ~58 | ~13 | -78% |
| **JSONB size per eval** | ~150KB | ~35KB | -77% |
| **ChromaDB query cost** | High (50 vectors) | Low (5 vectors) | -90% |
| **API exposure** | None | None | No change |
| **Frontend usage** | None | None | No change |
| **Actual impact** | Zero (data unused) | Zero (data unused) | No change |

**Benefit of Fix**: Reduced wasted resources with **zero functional impact** since data was never used.

---

## 6. Why Store It If Unused?

### Possible Reasons

1. **Audit Trail**: Forensic debugging of AI decisions
   - "Which documents influenced this grade?"
   - "What chunks were actually retrieved?"

2. **Future Feature**: Planned but not implemented UI
   - Professor dashboard: "View retrieved sources"
   - Student view: "See what material was consulted"

3. **A/B Testing**: Compare retrieval strategies
   - Track which chunks lead to better evaluations
   - Analyze relevance_score distributions

4. **Compliance**: Educational institutions may require traceability
   - "Show me what documents the AI used"
   - Academic integrity investigations

5. **Legacy Code**: Originally intended for use, now vestigial

---

## 7. Evidence Summary

### Database (Evaluation Model)
| File | Line | Evidence |
|------|------|----------|
| `backend/app/models/evaluation.py` | 42 | Column defined: `retrieved_chunks: Mapped[list[Any] \| None]` |
| `backend/app/tasks/grading.py` | 207-221 | Data written (update path) |
| `backend/app/tasks/grading.py` | 250-265 | Data written (create path) |
| `backend/app/api/v1/endpoints/evaluations.py` | 372 | Manual eval: `retrieved_chunks=None` |

### API Schemas (Pydantic)
| File | Lines | Evidence |
|------|-------|----------|
| `backend/app/schemas/evaluation.py` | 21-64 | `EvaluationOut` - NO retrieved_chunks field |
| `backend/app/schemas/evaluation.py` | 67-79 | `EvaluationListOut` - NO retrieved_chunks field |
| `backend/app/schemas/evaluation.py` | 125-140 | `StudentEvaluationOut` - NO retrieved_chunks field |

**Search Result**: 0 matches for `retrieved_chunks|retrieved_sources` in entire schemas file

### Frontend
| Scope | Pattern | Result |
|-------|---------|--------|
| `frontend/src/**/*.{ts,tsx,js,jsx}` | `retrieved_chunks\|retrieved_sources\|retrievedChunks\|retrievedSources` | **0 matches** |

---

## 8. Recommendations

### Option 1: Keep As Audit Data (Current State)
**Pros**:
- Forensic debugging capability
- Compliance/traceability
- No code changes needed

**Cons**:
- ~35KB of unused JSONB per evaluation (after fix)
- Still ~13 chunks stored (could be 0 if only needed source_name)

---

### Option 2: Expose to API/Frontend
Add to schemas and build UI:
```python
class EvaluationOut(BaseModel):
    # ... existing fields ...
    retrieved_sources: Optional[list[str]] = None  # Just file names
```

**Pros**:
- Transparency for professors/students
- "AI consulted these documents" feature

**Cons**:
- UI/UX work required
- May confuse users if rubrics appear but aren't in prompt

---

### Option 3: Store Only source_name (Not Full Chunks)
Change stored data to:
```python
retrieved_chunks=[
    {"source_name": chunk.source_name, "doc_type": chunk.doc_type}
    for chunk in (rubric_chunks + notes_chunks + sample_chunks)
]
```

**Pros**:
- Audit trail preserved (can trace back to documents)
- **99% smaller**: ~300 bytes vs. 35KB

**Cons**:
- Lose full chunk_text (can't reconstruct exact retrieval)
- Lose relevance_score (can't debug similarity rankings)

---

### Option 4: Remove Entirely
Set `retrieved_chunks=None` for all evaluations:

**Pros**:
- No wasted storage
- Simpler data model

**Cons**:
- Lose forensic capability
- Can't debug "why did AI retrieve X?"

---

## 9. Final Findings

### Questions Answered

**Q: Is retrieved_chunks returned in any API response schema?**  
**A**: ❌ **NO** - All Pydantic schemas (`EvaluationOut`, `EvaluationListOut`, `StudentEvaluationOut`) exclude this field.

**Q: Does the frontend render it anywhere?**  
**A**: ❌ **NO** - Zero references in entire frontend codebase.

**Q: Is it fetched-but-unused on frontend side too?**  
**A**: Not applicable - it's never fetched (API doesn't return it).

---

### Data Lifecycle

```
[WRITE]                [STORE]              [READ]
Grading Task    →    Database Column    →    NEVER
(13 chunks)          (JSONB ~35KB)           (Unused)
```

**Status**: Write-only audit data with no consumer

---

**Investigation Complete**: August 15, 2026  
**Recommendation**: Keep as audit data (Option 1) - minimal cost after fix, provides forensic value
