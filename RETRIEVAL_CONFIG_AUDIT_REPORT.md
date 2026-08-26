# Retrieval Configuration Audit Report

**Date**: August 15, 2026  
**Purpose**: Resolve conflicting documentation about retrieval n_results values  
**Status**: ✅ **AUDIT COMPLETE**

---

## Executive Summary

The actual code **matches neither documented version**. Here's what the code actually does:

| Document Type | Actual n_results | Filter Conditions | Source |
|---------------|------------------|-------------------|--------|
| **Rubric** | **50** | `doc_type` AND `assignment_id` | ChromaDB (but unused in prompt) |
| **Notes** | **5** | `doc_type` ONLY | ChromaDB |
| **Sample Solution** | **3** | `doc_type` AND `assignment_id` | ChromaDB |

**Critical Finding**: Rubric criteria come from the **relational `rubrics` table** via SQLAlchemy, NOT from ChromaDB retrieval. The ChromaDB rubric retrieval exists but is **functionally dead code** - retrieved but never used in the evaluator prompt.

---

## 1. Actual n_results Values

### Location: `backend/app/rag/retrieval.py::retrieve_context()`

#### Rubric Documents (Lines 109-118)
```python
# Retrieve rubric chunks (all chunks, rubric must be complete)
# ChromaDB requires $and operator for multiple conditions
rubric_chunks = self._query_collection(
    collection_name=collection_name,
    query_embedding=query_embedding,
    n_results=50,  # Get all rubric chunks  ← HARDCODED
    where_filter={
        "$and": [
            {"doc_type": DocumentType.RUBRIC.value},
            {"assignment_id": str(assignment_id)},
        ]
    },
    db_session=db_session,
)
```
**Actual Value**: `n_results=50` (hardcoded magic number)  
**Comment says**: "Get all rubric chunks" / "rubric must be complete"

---

#### Course Notes (Lines 120-129)
```python
# Retrieve course notes chunks (top 5 most relevant)
notes_chunks = self._query_collection(
    collection_name=collection_name,
    query_embedding=query_embedding,
    n_results=5,  ← HARDCODED
    where_filter={
        "doc_type": DocumentType.NOTES.value,
    },
    db_session=db_session,
)
```
**Actual Value**: `n_results=5` (hardcoded magic number)  
**Comment says**: "top 5 most relevant"

---

#### Sample Solutions (Lines 131-142)
```python
# Retrieve sample solution chunks (top 3 most relevant)
# ChromaDB requires $and operator for multiple conditions
sample_chunks = self._query_collection(
    collection_name=collection_name,
    query_embedding=query_embedding,
    n_results=3,  ← HARDCODED
    where_filter={
        "$and": [
            {"doc_type": DocumentType.SAMPLE_SOLUTION.value},
            {"assignment_id": str(assignment_id)},
        ]
    },
    db_session=db_session,
)
```
**Actual Value**: `n_results=3` (hardcoded magic number)  
**Comment says**: "top 3 most relevant"

---

## 2. Configuration Source

**Location Checked**: `backend/app/core/config.py`

**Search Query**: `TOP_K|N_RESULTS|RUBRIC|NOTES|SAMPLE|RETRIEV`

**Result**: ❌ **NO matches found**

**Conclusion**: All n_results values are **hardcoded magic numbers** inline in `retrieval.py`. There are **NO config variables** in Settings (no `RUBRIC_TOP_K`, `NOTES_TOP_K`, `SAMPLE_TOP_K`, etc.).

---

## 3. where_filter Logic

### Rubric Filter (Lines 114-117)
```python
where_filter={
    "$and": [
        {"doc_type": DocumentType.RUBRIC.value},
        {"assignment_id": str(assignment_id)},
    ]
}
```
✅ **Uses `$and` operator for multiple conditions**  
✅ **Filters by**: `doc_type` AND `assignment_id`

---

### Notes Filter (Lines 126-128)
```python
where_filter={
    "doc_type": DocumentType.NOTES.value,
}
```
✅ **Single condition only**: `doc_type`  
❌ **NO assignment_id filter** - retrieves notes from entire course, not assignment-specific

**Reason**: Course notes are course-level documents, not assignment-specific

---

### Sample Solution Filter (Lines 137-140)
```python
where_filter={
    "$and": [
        {"doc_type": DocumentType.SAMPLE_SOLUTION.value},
        {"assignment_id": str(assignment_id)},
    ]
}
```
✅ **Uses `$and` operator for multiple conditions**  
✅ **Filters by**: `doc_type` AND `assignment_id`

---

### $and Operator Verification

**Comment in code** (line 110):
```python
# ChromaDB requires $and operator for multiple conditions
```

**Verified**: Code **correctly uses** `{"$and": [...]}` for multi-condition filters (rubric and sample_solution).

**Notes filter**: Single condition only, so `$and` not needed.

---

## 4. Rubric Retrieval: ChromaDB vs. Relational DB

### Critical Discovery: Dual Rubric Sources

The system has **TWO sources** for rubric data:

#### Source 1: ChromaDB Retrieval (UNUSED IN PROMPT)
**Location**: `backend/app/rag/retrieval.py` (lines 109-118)
- Retrieves `rubric_chunks` from ChromaDB
- Returns chunks with n_results=50
- Included in `RetrievalResult.rubric_chunks`

#### Source 2: Relational Database (ACTUALLY USED)
**Location**: `backend/app/tasks/grading.py` (lines 87-89)
```python
rubrics = db.query(Rubric).filter(
    Rubric.assignment_id == assignment.id
).order_by(Rubric.created_at).all()
```
- Loads rubric criteria from **`rubrics` table** via SQLAlchemy
- Ordered by `created_at`
- Passed to `evaluator.evaluate(rubrics=rubrics, ...)`

---

### Where Rubrics Are Used in Evaluation

**Location**: `backend/app/rag/evaluator.py::_build_user_prompt()` (lines 136-146)

```python
# Rubric criteria
prompt += "=== GRADING RUBRIC ===\n"
for rubric in rubrics:  # ← Uses SQLAlchemy rubrics list, NOT rubric_chunks
    prompt += f"""
Criterion: {rubric.criteria_name} (Weight: {rubric.weight}%, Max Points: {rubric.max_points})
Description: {rubric.description or "No description"}
Evaluation Hints: {rubric.evaluation_hints or "No specific hints"}
---
"""
```

**Key Finding**: The evaluator uses the **`rubrics` parameter** (from SQLAlchemy query), NOT `retrieval_result.rubric_chunks` (from ChromaDB).

---

### ChromaDB rubric_chunks: Where Are They Used?

**Search in evaluator.py**: `retrieval_result.rubric_chunks`

**Found in**: Lines 113, 289, 336
- Line 113: Extraction of `retrieved_sources` (file names)
- Line 289: Extraction of `retrieved_sources` (retry path)
- Line 336: Extraction of `retrieved_sources` (fallback)

**Usage Pattern**:
```python
sources = list(set(
    chunk.source_name
    for chunks in [
        retrieval_result.rubric_chunks,  # ← Only used for source names
        retrieval_result.notes_chunks,
        retrieval_result.sample_chunks,
    ]
    for chunk in chunks
))
```

**Conclusion**: `rubric_chunks` are **ONLY used to populate `retrieved_sources`** (list of file names). The actual rubric **text/content** is never used in the prompt.

---

### Notes and Sample Chunks: Are They Used?

**Notes** (lines 149-156):
```python
if retrieval_result.notes_chunks:
    prompt += "\n=== RELEVANT COURSE MATERIAL ===\n"
    for chunk in retrieval_result.notes_chunks:
        prompt += f"""
Source: {chunk.source_name}
{chunk.chunk_text}  # ← Actually used
---
"""
```
✅ **Used**: `chunk.chunk_text` included in prompt

**Sample Solutions** (lines 159-163):
```python
if retrieval_result.sample_chunks:
    prompt += "\n=== SAMPLE SOLUTION EXCERPTS ===\n"
    for chunk in retrieval_result.sample_chunks:
        prompt += f"{chunk.chunk_text}\n---\n"  # ← Actually used
```
✅ **Used**: `chunk.chunk_text` included in prompt

---

## 5. Summary: What Actually Happens

### Data Flow

1. **Rubrics from DB** (SQLAlchemy):
   ```
   grading.py (line 87-89) 
   → Query `rubrics` table 
   → Load all rubrics for assignment
   → Pass to evaluator.evaluate(rubrics=...)
   → Included in prompt as "=== GRADING RUBRIC ==="
   ```

2. **Rubric Chunks from ChromaDB** (unused):
   ```
   retrieval.py (line 109-118)
   → Retrieve 50 chunks from ChromaDB
   → Return as retrieval_result.rubric_chunks
   → evaluator.py: Extract source_name only
   → NOT included in prompt text
   ```

3. **Notes from ChromaDB** (used):
   ```
   retrieval.py (line 120-129)
   → Retrieve 5 chunks from ChromaDB
   → Return as retrieval_result.notes_chunks
   → Included in prompt as "=== RELEVANT COURSE MATERIAL ==="
   ```

4. **Sample Solutions from ChromaDB** (used):
   ```
   retrieval.py (line 131-142)
   → Retrieve 3 chunks from ChromaDB
   → Return as retrieval_result.sample_chunks
   → Included in prompt as "=== SAMPLE SOLUTION EXCERPTS ==="
   ```

---

## 6. Comparison to Documentation Claims

### Documentation Version 1 (Claimed)
- Rubric: ALL (n=50)
- Notes: top 5
- Sample: top 3

**Verdict**: ✅ **Matches actual code for n_results values**

---

### Documentation Version 2 (Claimed)
- Notes: top 15
- Sample: top 10
- Rubric: top 5 ("not fully implemented")

**Verdict**: ❌ **Does NOT match actual code**

---

### DATABASE.md Limitation
**Claim**: "rubric: not yet fully used in RAG"

**Verdict**: ✅ **CORRECT** - Rubric chunks are retrieved from ChromaDB but never used in the evaluator prompt. Actual rubric criteria come from the `rubrics` table directly.

---

## 7. Known Issues & Discrepancies

### Issue 1: Unused ChromaDB Rubric Retrieval
**Status**: Dead code / Wasted resources

**Evidence**:
- `retrieval.py` queries ChromaDB for 50 rubric chunks
- `evaluator.py` never includes `rubric_chunks[].chunk_text` in prompt
- Only `source_name` is used (for metadata)

**Impact**:
- Unnecessary ChromaDB query (50 chunks + embeddings)
- Confusing codebase (two rubric sources)
- Misleading logs ("rubric_count" in retrieval logs)

**Possible Reasons**:
1. Originally intended to use ChromaDB rubrics but switched to relational DB
2. Rubric documents (PDFs) exist in ChromaDB for backup/audit purposes
3. Feature partially implemented then abandoned

---

### Issue 2: Hardcoded Magic Numbers
**Status**: Configuration smell

**Evidence**: All n_results values hardcoded in `retrieval.py`

**Impact**:
- Cannot adjust retrieval size without code change
- No environment-specific tuning (dev vs. prod)
- Inconsistent with other configurable values

**Recommendation**: Move to Settings:
```python
# In backend/app/core/config.py
RUBRIC_CHUNKS_TOP_K: int = Field(default=50)
NOTES_CHUNKS_TOP_K: int = Field(default=5)
SAMPLE_CHUNKS_TOP_K: int = Field(default=3)
```

---

### Issue 3: Assignment-Level vs. Course-Level Documents
**Status**: Correct behavior, but undocumented

**Evidence**:
- Rubric: filtered by `assignment_id` (assignment-specific) ✅
- Sample: filtered by `assignment_id` (assignment-specific) ✅
- Notes: NO `assignment_id` filter (course-level) ✅

**Impact**: None - this is correct behavior, but should be documented

**Reason**: Course notes are uploaded once per course, not per assignment

---

## 8. File/Line Reference Summary

| Item | File | Lines | Value/Behavior |
|------|------|-------|----------------|
| **Rubric n_results** | `backend/app/rag/retrieval.py` | 114 | `n_results=50` (hardcoded) |
| **Notes n_results** | `backend/app/rag/retrieval.py` | 125 | `n_results=5` (hardcoded) |
| **Sample n_results** | `backend/app/rag/retrieval.py` | 136 | `n_results=3` (hardcoded) |
| **Config check** | `backend/app/core/config.py` | N/A | No retrieval config found |
| **Rubric filter** | `backend/app/rag/retrieval.py` | 114-117 | Uses `$and`, filters by `doc_type` AND `assignment_id` |
| **Notes filter** | `backend/app/rag/retrieval.py` | 126-128 | Single condition: `doc_type` only |
| **Sample filter** | `backend/app/rag/retrieval.py` | 137-140 | Uses `$and`, filters by `doc_type` AND `assignment_id` |
| **Rubric DB query** | `backend/app/tasks/grading.py` | 87-89 | Loads from `rubrics` table via SQLAlchemy |
| **Rubric usage in prompt** | `backend/app/rag/evaluator.py` | 136-146 | Uses SQLAlchemy `rubrics`, NOT ChromaDB `rubric_chunks` |
| **Notes usage in prompt** | `backend/app/rag/evaluator.py` | 149-156 | Uses ChromaDB `notes_chunks.chunk_text` |
| **Sample usage in prompt** | `backend/app/rag/evaluator.py` | 159-163 | Uses ChromaDB `sample_chunks.chunk_text` |
| **rubric_chunks only usage** | `backend/app/rag/evaluator.py` | 113, 289, 336 | Only `source_name` extracted, NOT `chunk_text` |

---

## 9. Answer to User Questions

### Q1: Exact n_results values?
- **Rubric**: 50
- **Notes**: 5
- **Sample**: 3

### Q2: Hardcoded or config?
**Hardcoded magic numbers** inline in `retrieval.py`. NO config variables in `Settings`.

### Q3: where_filter conditions?
- **Rubric**: ✅ Uses `$and`, filters by `doc_type` AND `assignment_id`
- **Sample**: ✅ Uses `$and`, filters by `doc_type` AND `assignment_id`
- **Notes**: Single condition: `doc_type` only (correct - course-level)

### Q4: Are rubrics retrieved via ChromaDB?
**Yes, they ARE retrieved**, but the chunks are **NOT used** in the evaluator prompt. Actual rubric criteria come from the relational `rubrics` table.

### Q5: What does evaluator actually use?
- **Rubric criteria**: From SQLAlchemy `rubrics` (relational DB)
- **Rubric chunks**: Only `source_name` (file name), NOT `chunk_text`
- **Notes chunks**: Full `chunk_text` included in prompt
- **Sample chunks**: Full `chunk_text` included in prompt

---

## 10. Which Documentation Matches Reality?

**Documentation Version 1** (rubric=50, notes=5, sample=3):
- ✅ **n_results values are correct**
- ❌ **Misleading**: Implies rubric chunks are used in grading (they're not)

**Documentation Version 2** (notes=15, sample=10, rubric=5):
- ❌ **Completely wrong** - all values incorrect

**DATABASE.md Limitation** ("rubric: not yet fully used in RAG"):
- ✅ **CORRECT** - Most accurate statement
- Should clarify: Rubrics are retrieved but content is unused; SQLAlchemy `rubrics` table is the actual source

---

## 11. Recommendations

1. **Remove dead code**: Either use ChromaDB rubric chunks in prompt, OR remove the retrieval entirely
2. **Move to config**: Extract hardcoded n_results to Settings environment variables
3. **Document clearly**: Update docs to reflect that rubrics come from relational DB, not ChromaDB
4. **Optimize query**: Don't retrieve 50 rubric chunks if they're only used for file names (retrieve 1 or use metadata query)
5. **Log clarity**: Change log message from "rubric_count" to "rubric_document_count" to avoid confusion with rubric criteria count

---

**Audit Status**: ✅ **COMPLETE**  
**Next Action**: Decide whether to fix dead code or update documentation to match reality
