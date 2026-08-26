# Manual Mode Grading Gap Analysis

## Executive Summary

**❌ NO - After the grading_mode fix, professors CANNOT grade manual-mode submissions through any existing endpoint.**

There is a critical gap in the API: the system has no way to create an Evaluation for manual-mode submissions.

---

## Question 1: Does override_evaluation() require an existing Evaluation row?

**Answer: YES - It requires an existing Evaluation row and will 404 if not found.**

### Evidence from `backend/app/api/v1/endpoints/evaluations.py` (lines 213-240):

```python
@router.post("/{evaluation_id}/override", response_model=EvaluationOut)
async def override_evaluation(
    evaluation_id: uuid.UUID,
    request: OverrideEvaluationRequest,
    current_user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
) -> EvaluationOut:
    """
    Override an AI evaluation with manual grading.
    Sets final_score to professor's score and marks as overridden.
    
    Professor only.
    """
    # Load evaluation
    query = (
        select(Evaluation)
        .where(Evaluation.id == evaluation_id)
        .options(
            joinedload(Evaluation.submission).joinedload(Submission.assignment).joinedload(Assignment.course)
        )
    )
    
    result = await db.execute(query)
    evaluation = result.scalar_one_or_none()
    
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")  # ← 404 if missing
```

**Key findings:**
- ❌ No upsert logic
- ❌ No create-if-missing behavior
- ❌ Requires `evaluation_id` path parameter (must know ID in advance)
- ✅ Explicitly returns 404 if evaluation doesn't exist (line 240)
- ✅ Designed to override **existing** AI evaluations only

**Conclusion:** `override_evaluation()` CANNOT be used to grade manual-mode submissions because there's no Evaluation row to override.

---

## Question 2: Is there ANY code path that creates an Evaluation for manual-mode submissions?

**Answer: NO - There is NO code path that creates Evaluations for manual-mode submissions.**

### Evidence:

#### All Evaluation() instantiations in the codebase:

**Search results for `Evaluation(`:**

1. ✅ **`backend/app/tasks/grading.py:224`** - `evaluate_submission()` task
   - **Status**: Only code that creates Evaluation rows
   - **Problem**: NOT queued for `grading_mode='manual'` after our fix

2. ❌ **`backend/app/models/evaluation.py:24`** - Class definition
   - Not instantiation, just the model class

3. ❌ **`backend/app/rag/evaluator.py`** - Helper methods
   - `_create_fallback_evaluation()` - Returns `EvaluationResult` dataclass, NOT database model
   - `_retry_evaluation()` - Returns `EvaluationResult` dataclass, NOT database model

4. ❌ **`backend/app/api/v1/endpoints/evaluations.py`**
   - `approve_evaluation()` - Modifies existing, doesn't create
   - `override_evaluation()` - Modifies existing, doesn't create
   - `trigger_evaluation()` - Queues `evaluate_submission` task, doesn't create directly
   - `get_student_evaluation()` - Read-only

**Conclusion:** Only `evaluate_submission()` task creates Evaluation rows, and it's NOT queued for manual mode.

---

## Question 3: Is there a "create evaluation" or "manual grade" endpoint?

**Answer: NO - No such endpoint exists.**

### Complete list of evaluation endpoints:

From `backend/app/api/v1/router.py` and `backend/app/api/v1/endpoints/evaluations.py`:

| Method | Endpoint | Purpose | Creates Evaluation? |
|--------|----------|---------|---------------------|
| GET | `/evaluations/pending` | List pending evaluations | ❌ No |
| GET | `/evaluations/{evaluation_id}` | Get evaluation details | ❌ No |
| POST | `/evaluations/{evaluation_id}/approve` | Approve AI evaluation | ❌ No (modifies existing) |
| POST | `/evaluations/{evaluation_id}/override` | Override AI evaluation with manual score | ❌ No (modifies existing) |
| POST | `/evaluations/trigger/{submission_id}` | Manually trigger AI evaluation task | ⚠️ Indirect (queues task) |
| GET | `/evaluations/submission/{submission_id}` | Student views their grade | ❌ No |

**Observations:**
- ❌ No `POST /evaluations` endpoint
- ❌ No `POST /evaluations/manual/{submission_id}` endpoint
- ❌ No `POST /submissions/{submission_id}/grade` endpoint
- ✅ Only `/trigger/{submission_id}` creates evaluations, but it queues AI evaluation task

---

## The Problem: Manual Mode Workflow is Broken

### Current State After Fix:

```
Manual Mode Assignment Submission Flow:

1. Student submits → POST /submissions
   ↓
2. submission.py checks grading_mode
   ↓
3. grading_mode == 'manual'
   ↓
4. ❌ evaluate_submission task NOT queued (as intended)
   ↓
5. ❌ No Evaluation row created
   ↓
6. Professor wants to grade...
   ↓
7. ❌ No endpoint to create Evaluation
   ↓
8. ❌ override_evaluation() returns 404
   ↓
9. 💥 DEAD END - Cannot grade submission
```

### What professors see:

1. **Submissions list** (`GET /submissions/{assignment_id}/all`):
   - ✅ Shows submission exists
   - ✅ Shows `status = 'submitted'` or `'late'`
   - ❌ No evaluation exists

2. **Try to grade**:
   - ❌ No evaluation_id to call `/override`
   - ❌ No endpoint to create evaluation from scratch
   - ⚠️ Could call `/trigger/{submission_id}` but that runs AI evaluation (defeats purpose of manual mode)

---

## Workarounds (All Suboptimal)

### Workaround 1: Use trigger_evaluation()
```
POST /evaluations/trigger/{submission_id}
```

**Problems:**
- ✅ Creates an evaluation
- ❌ Runs full AI evaluation (wastes API credits)
- ❌ Generates AI score professor didn't want
- ❌ Professor then overrides AI score anyway
- ❌ Defeats entire purpose of manual mode

**Verdict:** Wasteful and contradicts intended behavior

---

### Workaround 2: Professor manually creates Evaluation via direct DB access
**Problems:**
- ❌ Not exposed via API
- ❌ Requires database access
- ❌ Bypasses validation
- ❌ Not a realistic production workflow

**Verdict:** Not a solution

---

### Workaround 3: Change assignment to hybrid mode
**Problems:**
- ❌ Runs AI evaluation for all future submissions
- ❌ Can't switch back after submissions exist
- ❌ Not scalable

**Verdict:** Not a solution

---

## Root Cause

The API was designed with the assumption that **all evaluations start with AI**:
- `approve` = AI score is good, accept it
- `override` = AI score exists but professor wants different score

**Manual mode was never fully implemented** - there's no path to create an evaluation without AI.

---

## Impact Assessment

### Severity: **CRITICAL** 🔴

### Affected Users:
- ✅ Professors using `grading_mode='manual'` assignments
- ✅ Students in manual-mode assignments (cannot see grades)

### Impact:
- 🚫 **Complete blocking issue**: Professors cannot grade manual-mode submissions at all
- 🚫 Students in manual courses cannot receive any grades
- 🚫 Manual mode is effectively unusable

### Frequency:
- ✅ Occurs for 100% of submissions in manual-mode assignments
- ✅ Discovered immediately after first manual-mode submission

---

## Required Fix

**Need new endpoint: Create manual evaluation**

### Proposed endpoint:

```
POST /evaluations/manual/{submission_id}
```

**Request body:**
```json
{
  "final_score": 85.0,
  "professor_feedback": "Good work overall...",
  "criteria_scores": [
    {
      "criterion_name": "Code Quality",
      "awarded": 20,
      "max": 25,
      "reasoning": "Well structured but missing comments"
    }
  ]
}
```

**Behavior:**
1. Verify professor owns the course
2. Verify assignment is manual or hybrid mode (optional check)
3. Create Evaluation row directly WITHOUT running AI:
   - `submission_id` = from path parameter
   - `ai_score` = 0 or NULL (no AI ran)
   - `final_score` = from request body
   - `approval_status` = 'overridden' (professor grade, not AI)
   - `professor_feedback` = from request body
   - `approved_by` = current professor
   - `approved_at` = now
   - `ai_feedback` = store criteria_scores if provided
4. Update submission.status = 'evaluated'
5. Return created evaluation

**Alternative:** Modify `override_evaluation()` to accept `submission_id` and create if missing:

```
POST /evaluations/override-or-create/{submission_id}
```

This would be more backward compatible but slightly less RESTful.

---

## Database State

### For manual-mode submissions (after fix):

```sql
-- Check submissions without evaluations
SELECT 
    s.id as submission_id,
    a.title as assignment,
    a.grading_mode,
    u.name as student,
    s.status,
    CASE 
        WHEN e.id IS NULL THEN 'NO EVALUATION'
        ELSE 'HAS EVALUATION'
    END as eval_status
FROM submissions s
JOIN assignments a ON s.assignment_id = a.id
JOIN users u ON s.student_id = u.id
LEFT JOIN evaluations e ON e.submission_id = s.id
WHERE a.grading_mode = 'manual';
```

**Expected result after fix applied:**
- All manual-mode submissions have `eval_status = 'NO EVALUATION'`
- These submissions are stuck - cannot be graded

---

## Recommendation

**Immediate action required:**

1. ✅ Keep the grading_mode fix from earlier (don't revert)
2. ✅ Create new endpoint: `POST /evaluations/manual/{submission_id}`
3. ✅ Allow professors to create evaluations from scratch for manual grading
4. ⚠️ Optionally: Add validation to only allow for manual/hybrid mode
5. ⚠️ Update frontend to show different UI for manual vs AI evaluations

**Without this fix, manual mode is completely broken.**

---

## Testing After Fix is Applied

### Test Case 1: Manual mode submission → grade
1. Create assignment with `grading_mode='manual'`
2. Student submits
3. ✅ Verify no AI evaluation is queued
4. ✅ Verify no evaluation row exists
5. Professor calls `POST /evaluations/manual/{submission_id}` with score
6. ✅ Verify evaluation created with approval_status='overridden'
7. ✅ Verify student can view grade
8. ✅ Verify submission.status='evaluated'

### Test Case 2: Hybrid mode (verify not broken)
1. Create assignment with `grading_mode='hybrid'`
2. Student submits
3. ✅ AI evaluation still runs
4. ✅ Evaluation created with approval_status='pending'
5. ✅ Professor can approve OR use new manual endpoint to override
6. ✅ Both workflows work

---

## Summary

### Can professors currently grade manual-mode submissions?

**❌ NO**

### Evidence:

1. ✅ `override_evaluation()` requires existing Evaluation (404 if not found)
2. ✅ No code path creates Evaluation for manual mode (task not queued)
3. ✅ No "create evaluation" or "manual grade" endpoint exists
4. ✅ Only workaround is to trigger AI evaluation (defeats purpose)

### Impact:

- 🔴 **BLOCKING**: Manual mode is completely unusable
- 🔴 **CRITICAL**: Professors cannot grade, students cannot see grades
- 🔴 **100% occurrence rate** for manual-mode assignments

### Next Steps:

**MUST create new endpoint to allow manual evaluation creation before manual mode can be used.**
