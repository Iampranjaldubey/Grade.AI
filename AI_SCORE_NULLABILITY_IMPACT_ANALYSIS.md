# ai_score Nullability Impact Analysis

## Summary

Complete analysis of all `ai_score` usages in the backend to identify breaking changes if the column becomes nullable.

---

## Files That Will Break or Need Changes

### 1. ❌ **`backend/app/schemas/evaluation.py`** - WILL BREAK

#### Line 26: `EvaluationOut` schema
```python
class EvaluationOut(BaseModel):
    """Complete evaluation response."""
    id: UUID
    submission_id: UUID
    ai_score: Decimal  # ← NOT NULL - will fail validation if None
    final_score: Optional[Decimal] = None
    # ...
```

**Issue**: Pydantic field typed as `Decimal` (not `Decimal | None`)

**Impact**: 
- Pydantic will raise validation error when serializing manual evaluations
- Will fail at `EvaluationOut.model_validate(evaluation)` if `ai_score` is NULL
- Affects all endpoints that return `EvaluationOut`

**Fix Required**: Change to `ai_score: Optional[Decimal] = None`

---

#### Line 65: `EvaluationListOut` schema
```python
class EvaluationListOut(BaseModel):
    """Evaluation list item for professor's pending reviews."""
    id: UUID
    submission_id: UUID
    ai_score: Decimal  # ← NOT NULL - will fail validation if None
    approval_status: ApprovalStatus
    # ...
```

**Issue**: Pydantic field typed as `Decimal` (not `Decimal | None`)

**Impact**:
- Will fail when listing evaluations that include manual ones
- Affects `GET /evaluations/pending` endpoint

**Fix Required**: Change to `ai_score: Optional[Decimal] = None`

---

### 2. ⚠️ **`backend/app/api/v1/endpoints/evaluations.py`** - NEEDS CHANGES

#### Line 84: `list_pending_evaluations()` - Direct assignment
```python
output.append(
    EvaluationListOut(
        id=evaluation.id,
        submission_id=evaluation.submission_id,
        ai_score=evaluation.ai_score,  # ← Direct assignment, no null check
        approval_status=evaluation.approval_status,
        # ...
    )
)
```

**Issue**: Passes `ai_score` directly to Pydantic without null handling

**Impact**: 
- After schema fix, will work (Pydantic accepts None)
- But might want to handle display differently for manual evaluations

**Fix Required**: After schema is fixed, this will work automatically

---

#### Line 189: `approve_evaluation()` - Copies ai_score to final_score
```python
# Approve evaluation
evaluation.approval_status = ApprovalStatus.APPROVED
evaluation.final_score = evaluation.ai_score  # ← Copies ai_score
evaluation.approved_by = current_user.id
evaluation.approved_at = datetime.utcnow()
```

**Issue**: Assumes `ai_score` is not NULL

**Impact**: 
- This endpoint is for approving **AI evaluations** only
- Manual evaluations won't have `approval_status=PENDING`, so won't reach this code
- BUT: if someone manually triggers AI evaluation on a manual-mode assignment, then approves it, this works fine

**Fix Required**: 
- Add assertion/check: `if evaluation.ai_score is None: raise 400 "Cannot approve evaluation without AI score"`
- Or: Allow it and document that approving a NULL ai_score sets final_score to NULL (probably wrong)

**Recommendation**: Add validation check

---

#### Line 286: `override_evaluation()` - Logs ai_score
```python
logger.info(
    "evaluation_overridden",
    evaluation_id=str(evaluation_id),
    professor_id=str(current_user.id),
    ai_score=float(evaluation.ai_score),  # ← float() conversion, will fail if None
    final_score=float(evaluation.final_score),
)
```

**Issue**: `float(None)` raises TypeError

**Impact**:
- Logging will crash if ai_score is NULL
- Entire override operation will fail (before commit likely)

**Fix Required**: 
```python
ai_score=float(evaluation.ai_score) if evaluation.ai_score is not None else None,
```

---

### 3. ⚠️ **`backend/app/tasks/grading.py`** - NEEDS CHANGES

#### Lines 183, 211, 226, 255: Sets and copies ai_score
```python
# Line 183: Update existing evaluation
existing_eval.ai_score = Decimal(str(evaluation_result.total_score))

# Line 211: Auto-approve (copy ai_score to final_score)
existing_eval.final_score = existing_eval.ai_score

# Line 226: Create new evaluation
evaluation = Evaluation(
    submission_id=uuid.UUID(submission_id),
    ai_score=Decimal(str(evaluation_result.total_score)),  # ← Sets ai_score
    # ...
)

# Line 255: Auto-approve (copy ai_score to final_score)
evaluation.final_score = evaluation.ai_score
```

**Issue**: These are all in the AI evaluation task

**Impact**: 
- These lines are FINE - they only run when AI evaluation happens
- Always have a valid score from AI
- Not affected by nullability change

**Fix Required**: None - these paths always have non-null ai_score

---

### 4. ✅ **`backend/app/models/evaluation.py`** - MODEL DEFINITION

#### Line 34: Column definition
```python
ai_score: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
```

**This is what we're changing to:**
```python
ai_score: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
```

---

### 5. ✅ **`backend/alembic/versions/001_initial_schema.py`** - MIGRATION

#### Line 368: Initial schema
```python
sa.Column("ai_score", sa.Numeric(10, 2), nullable=False),
```

**Will need NEW migration** to change column to nullable

---

## Files That Are OK (No Changes Needed)

### ✅ `backend/app/api/v1/endpoints/assignments.py`

**No direct usage of `ai_score`** - This file doesn't read or manipulate ai_score values.

Only checks if evaluations exist (uses `approval_status`), doesn't access `ai_score`.

---

## Summary of Required Changes

### Critical (Will Break)

1. **`backend/app/schemas/evaluation.py`**:
   - Line 26: `EvaluationOut.ai_score` → Change to `Optional[Decimal] = None`
   - Line 65: `EvaluationListOut.ai_score` → Change to `Optional[Decimal] = None`

### Important (Will Fail in Specific Cases)

2. **`backend/app/api/v1/endpoints/evaluations.py`**:
   - Line 189: Add null check in `approve_evaluation()` before copying ai_score
   - Line 286: Fix logging in `override_evaluation()` to handle NULL ai_score

### Required (Database Schema)

3. **`backend/app/models/evaluation.py`**:
   - Line 34: Change `nullable=False` to `nullable=True`
   - Change type hint to `Mapped[Decimal | None]`

4. **New Alembic migration**:
   - Create migration to `ALTER TABLE evaluations ALTER COLUMN ai_score DROP NOT NULL`

---

## Detailed Change Plan

### Change 1: Model Definition
**File**: `backend/app/models/evaluation.py` (line 34)

```python
# Before:
ai_score: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

# After:
ai_score: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
```

---

### Change 2: Pydantic Schemas
**File**: `backend/app/schemas/evaluation.py`

```python
# Line 26 - Before:
class EvaluationOut(BaseModel):
    """Complete evaluation response."""
    id: UUID
    submission_id: UUID
    ai_score: Decimal
    # ...

# Line 26 - After:
class EvaluationOut(BaseModel):
    """Complete evaluation response."""
    id: UUID
    submission_id: UUID
    ai_score: Optional[Decimal] = None
    # ...


# Line 65 - Before:
class EvaluationListOut(BaseModel):
    """Evaluation list item for professor's pending reviews."""
    id: UUID
    submission_id: UUID
    ai_score: Decimal
    # ...

# Line 65 - After:
class EvaluationListOut(BaseModel):
    """Evaluation list item for professor's pending reviews."""
    id: UUID
    submission_id: UUID
    ai_score: Optional[Decimal] = None
    # ...
```

---

### Change 3: Approve Endpoint Validation
**File**: `backend/app/api/v1/endpoints/evaluations.py` (around line 188)

```python
# Before:
# Approve evaluation
evaluation.approval_status = ApprovalStatus.APPROVED
evaluation.final_score = evaluation.ai_score
evaluation.approved_by = current_user.id

# After:
# Approve evaluation
# Can only approve evaluations that have an AI score
if evaluation.ai_score is None:
    raise HTTPException(
        status_code=400,
        detail="Cannot approve evaluation without AI score. Use /override to set a manual score.",
    )

evaluation.approval_status = ApprovalStatus.APPROVED
evaluation.final_score = evaluation.ai_score
evaluation.approved_by = current_user.id
```

---

### Change 4: Override Endpoint Logging
**File**: `backend/app/api/v1/endpoints/evaluations.py` (line 286)

```python
# Before:
logger.info(
    "evaluation_overridden",
    evaluation_id=str(evaluation_id),
    professor_id=str(current_user.id),
    ai_score=float(evaluation.ai_score),
    final_score=float(evaluation.final_score),
)

# After:
logger.info(
    "evaluation_overridden",
    evaluation_id=str(evaluation_id),
    professor_id=str(current_user.id),
    ai_score=float(evaluation.ai_score) if evaluation.ai_score is not None else None,
    final_score=float(evaluation.final_score),
)
```

---

### Change 5: Database Migration
**New file**: `backend/alembic/versions/00X_make_ai_score_nullable.py`

```python
"""make ai_score nullable for manual evaluations

Revision ID: <generated>
Revises: 87b46a5f2d9c
Create Date: <generated>
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '<generated>'
down_revision = '87b46a5f2d9c'  # Latest migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make ai_score nullable to support manual evaluations
    op.alter_column(
        'evaluations',
        'ai_score',
        existing_type=sa.Numeric(precision=10, scale=2),
        nullable=True,
        existing_nullable=False,
    )


def downgrade() -> None:
    # Revert ai_score to NOT NULL
    # WARNING: This will fail if any NULL values exist
    op.alter_column(
        'evaluations',
        'ai_score',
        existing_type=sa.Numeric(precision=10, scale=2),
        nullable=False,
        existing_nullable=True,
    )
```

---

## Testing Checklist After Changes

### Test Case 1: AI Evaluation (Existing Flow)
- [ ] Create auto/hybrid assignment
- [ ] Submit student submission
- [ ] Verify AI evaluation creates with non-null ai_score
- [ ] Verify `GET /evaluations/{id}` returns ai_score
- [ ] Verify approve/override still work

### Test Case 2: Manual Evaluation (New Flow)
- [ ] Create manual assignment
- [ ] Submit student submission
- [ ] Create manual evaluation (new endpoint, next task)
- [ ] Verify evaluation has NULL ai_score
- [ ] Verify `GET /evaluations/{id}` returns ai_score=null
- [ ] Verify cannot approve (should return 400)
- [ ] Verify override works with NULL ai_score

### Test Case 3: List Evaluations
- [ ] Create mix of AI and manual evaluations
- [ ] Call `GET /evaluations/pending`
- [ ] Verify response includes both types
- [ ] Verify manual evaluations show ai_score=null

### Test Case 4: Logging
- [ ] Override a manual evaluation
- [ ] Check logs show ai_score=None (not error)

---

## Impact Summary

| Component | Breaking? | Fix Complexity | Priority |
|-----------|-----------|----------------|----------|
| `app/schemas/evaluation.py` | ❌ YES | Easy (2 lines) | CRITICAL |
| `app/api/v1/endpoints/evaluations.py` (approve) | ⚠️ Potential | Easy (validation check) | HIGH |
| `app/api/v1/endpoints/evaluations.py` (logging) | ❌ YES | Easy (null handling) | HIGH |
| `app/models/evaluation.py` | N/A | Easy (1 line) | CRITICAL |
| Database migration | N/A | Medium (new migration) | CRITICAL |
| `app/tasks/grading.py` | ✅ NO | None | N/A |

---

## Rollback Plan

If issues discovered after deployment:

1. **Revert migration**: Run downgrade (WARNING: fails if NULL values exist)
2. **Revert code changes**: Git revert the commit
3. **Data cleanup**: If NULL ai_scores exist, need manual intervention

**Better approach**: Test thoroughly in staging first, then deploy to production.

---

## Conclusion

**Total changes needed: 5 files**

1. ✅ Model (1 line)
2. ✅ Schemas (2 lines)
3. ✅ Approve endpoint (add validation)
4. ✅ Override logging (null handling)
5. ✅ New migration file

**Estimated effort**: 30-45 minutes implementation + testing

**Risk level**: Medium (schema change, but straightforward)
