# Grading Mode Audit Report

## Executive Summary

**The `grading_mode` field is EFFECTIVELY UNUSED in the grading pipeline.**

All three modes (`auto`, `manual`, `hybrid`) currently behave identically:
- ✅ AI evaluation is **ALWAYS** triggered for every submission
- ❌ Evaluations **NEVER** auto-approve, regardless of mode
- ❌ Professor approval is **ALWAYS** required

## Findings

### 1. Submission Creation Endpoint - AI Evaluation Triggered Unconditionally

**File**: `backend/app/api/v1/endpoints/submissions.py`  
**Lines**: 164-177

```python
# Trigger AI evaluation after document processing completes
try:
    from app.tasks.grading import evaluate_submission
    evaluate_submission.apply_async(
        args=[str(submission.id)],
        countdown=15,  # wait 15s for document processing to complete first
    )
except Exception as exc:
    import structlog
    logger = structlog.get_logger(__name__)
    logger.error(
        "failed_to_queue_evaluation",
        submission_id=str(submission.id),
        error=str(exc),
    )
```

**Issue**: The AI evaluation task is queued **unconditionally** for every submission. There is **NO check** of `assignment.grading_mode` before triggering the task.

**Expected Behavior**:
- `manual` mode: Should **NOT** queue AI evaluation task
- `hybrid` mode: Should queue AI evaluation task ✓ (currently correct)
- `auto` mode: Should queue AI evaluation task ✓ (currently correct)

**Current Behavior**: All modes queue AI evaluation task (incorrect for `manual` mode)

---

### 2. Evaluation Task - No Auto-Approval Logic

**File**: `backend/app/tasks/grading.py`  
**Function**: `evaluate_submission()` (lines 30-266)

The task performs these steps:
1. Load submission and assignment data
2. Check if document is processed
3. Retrieve RAG context
4. Call AI evaluator (Gemini)
5. **Store evaluation with `approval_status = PENDING`** (line 48 of `models/evaluation.py`)
6. Update submission status to `EVALUATED`

**Issue**: The task **NEVER checks** `assignment.grading_mode` and **NEVER sets** `approval_status = 'approved'` automatically.

**Code Evidence**:
```python
# Line ~200-210 in grading.py - creates evaluation
evaluation = Evaluation(
    submission_id=uuid.UUID(submission_id),
    ai_score=Decimal(str(evaluation_result.total_score)),
    ai_feedback={...},
    strengths=evaluation_result.strengths,
    weaknesses=evaluation_result.weaknesses,
    missing_topics=evaluation_result.missing_topics,
    retrieved_chunks=[...],
    evaluated_at=datetime.utcnow(),
    # NO approval_status specified - defaults to PENDING
    # NO approved_by or approved_at set
    # NO final_score set
)
```

**Expected Behavior**:
- `auto` mode: Should set `approval_status = 'approved'`, `final_score = ai_score`, `approved_at = now()`
- `hybrid` mode: Should leave as `PENDING` for professor review ✓ (currently correct)
- `manual` mode: N/A (should not even create evaluation)

**Current Behavior**: All modes leave evaluation as `PENDING` (incorrect for `auto` mode)

---

### 3. Grading Mode Usage Across Codebase

**Comprehensive grep results for `grading_mode`:**

#### Where it's DEFINED/STORED:
- ✅ `app/models/assignment.py` (line 37-41) - Database column definition
- ✅ `app/schemas/assignment.py` (lines 20, 28, 40) - API schema
- ✅ `app/core/enums.py` (lines 22-25) - Enum definition
- ✅ `alembic/versions/001_initial_schema.py` (lines 62, 91, 231, 236) - Migration
- ✅ `frontend/src/types/api.ts` (lines 84, 100) - TypeScript types
- ✅ `frontend/src/components/CreateAssignmentModal.tsx` (lines 16, 39, 68, 184, 188) - UI form

#### Where it's READ (but NOT used for logic):
- ⚠️ `app/rag/evaluator.py` (line 189) - **Only for display in AI prompt** ("Grading Mode: {assignment.grading_mode.value}")
- ⚠️ `frontend/src/pages/professor/AssignmentDetailPage.tsx` (line 207) - **Only for UI badge display**
- ⚠️ `frontend/src/pages/professor/CourseDetailPage.tsx` (line 383) - **Only for UI badge display**

#### Where it's MISSING (should be checked):
- ❌ `app/api/v1/endpoints/submissions.py` - **NOT checked before queueing evaluation**
- ❌ `app/tasks/grading.py` - **NOT checked for auto-approval logic**

---

## Database Schema Evidence

**File**: `backend/app/models/evaluation.py` (lines 48-54)

```python
approval_status: Mapped[ApprovalStatus] = mapped_column(
    pg_enum(ApprovalStatus, "approval_status"),
    nullable=False,
    default=ApprovalStatus.PENDING,
    server_default=ApprovalStatus.PENDING.value,
    index=True,
)
```

All evaluations are created with `approval_status = 'pending'` by default. There is **NO code path** that sets it to `'approved'` automatically based on grading mode.

---

## Approval Workflow (Current)

**File**: `backend/app/api/v1/endpoints/evaluations.py`

### All approval paths require professor action:

1. **`POST /{evaluation_id}/approve`** (lines 133-202)
   - Professor explicitly approves AI score
   - Sets `approval_status = 'approved'`
   - Sets `final_score = ai_score`
   - Sets `approved_by` and `approved_at`

2. **`POST /{evaluation_id}/override`** (lines 205-280)
   - Professor overrides with manual score
   - Sets `approval_status = 'overridden'`
   - Sets `final_score = professor's score`
   - Sets `approved_by` and `approved_at`

**No automatic approval pathway exists.**

---

## Student Grade Visibility

**File**: `backend/app/api/v1/endpoints/evaluations.py` (lines 340-396)

```python
@router.get("/submission/{submission_id}", response_model=StudentEvaluationOut)
async def get_student_evaluation(...):
    """
    Student views their own grade.
    Only returns approved or overridden evaluations (not pending).
    """
    query = (
        select(Evaluation)
        .join(Submission, Evaluation.submission_id == Submission.id)
        .where(Submission.id == submission_id)
        .where(Submission.student_id == current_user.id)
        .where(
            (Evaluation.approval_status == ApprovalStatus.APPROVED) |
            (Evaluation.approval_status == ApprovalStatus.OVERRIDDEN)
        )
    )
```

**Students can only see evaluations that are `APPROVED` or `OVERRIDDEN`.**

This means:
- Even if `auto` mode worked correctly, students would still need to wait for professor approval
- In `auto` mode, students should see grades immediately (but currently don't)

---

## Impact Analysis

### Current Behavior by Mode

| Mode | What Happens | What Should Happen | Impact |
|------|-------------|-------------------|---------|
| **`manual`** | ❌ AI evaluation runs<br>❌ Creates `PENDING` evaluation<br>✓ Professor must approve | ✗ No AI evaluation<br>✗ No evaluation created<br>✓ Professor grades manually | **Broken**: AI wastes resources evaluating when professor will grade manually anyway |
| **`hybrid`** | ✓ AI evaluation runs<br>✓ Creates `PENDING` evaluation<br>✓ Professor reviews | ✓ AI evaluation runs<br>✓ Creates `PENDING` evaluation<br>✓ Professor reviews | **Working correctly** (by accident) |
| **`auto`** | ✓ AI evaluation runs<br>❌ Creates `PENDING` evaluation<br>❌ Professor must approve | ✓ AI evaluation runs<br>✗ Should auto-approve<br>✗ Student sees grade immediately | **Broken**: Defeats purpose of auto mode - professor still has to click approve for every submission |

### Resource Waste

**For `manual` mode assignments:**
- AI evaluation runs unnecessarily
- Uses Gemini API credits (costs money)
- Uses Celery worker time
- Creates evaluations that will likely be overridden anyway
- Queries vector database for RAG context

### Professor Experience Impact

**For `auto` mode assignments:**
- Professor must manually click "approve" for every single submission
- Negates the entire purpose of auto-grading
- Creates bottleneck in grading workflow
- Evaluations pile up in "Pending" queue

**For `manual` mode assignments:**
- Professor sees AI scores they didn't ask for
- Confusion about whether to use AI score or ignore it
- Extra noise in the evaluation interface

---

## Root Causes

### 1. Missing Grading Mode Check in Submission Creation
**Location**: `backend/app/api/v1/endpoints/submissions.py:164-177`

The code unconditionally queues evaluation:
```python
evaluate_submission.apply_async(
    args=[str(submission.id)],
    countdown=15,
)
```

Should be:
```python
# Only queue AI evaluation for auto and hybrid modes
if assignment.grading_mode in [GradingMode.AUTO, GradingMode.HYBRID]:
    evaluate_submission.apply_async(
        args=[str(submission.id)],
        countdown=15,
    )
```

### 2. Missing Auto-Approval Logic in Evaluation Task
**Location**: `backend/app/tasks/grading.py:200-220`

After creating evaluation, should add:
```python
# Auto-approve if grading mode is AUTO
if assignment.grading_mode == GradingMode.AUTO:
    evaluation.approval_status = ApprovalStatus.APPROVED
    evaluation.final_score = evaluation.ai_score
    evaluation.approved_at = datetime.utcnow()
    # Note: approved_by could be NULL for auto-approvals,
    # or set to a system user ID
```

### 3. Incomplete Implementation
The feature was designed and added to the database schema, but the business logic was never fully implemented. Evidence:
- Database has the field ✓
- Frontend UI has the selector ✓
- Backend models have the enum ✓
- API accepts the value ✓
- **Pipeline ignores the value** ❌

---

## Recommendations

### Fix Priority: HIGH

**Reason**: 
- Wastes API credits on manual mode assignments
- Professor experience is degraded in auto mode
- Feature advertised in UI but doesn't work

### Implementation Plan

#### Phase 1: Add Conditional Evaluation Triggering (HIGH PRIORITY)
**File**: `backend/app/api/v1/endpoints/submissions.py`

```python
# After line 163, add grading mode check:
# Only queue AI evaluation for auto and hybrid modes
if assignment.grading_mode in [GradingMode.AUTO, GradingMode.HYBRID]:
    try:
        from app.tasks.grading import evaluate_submission
        evaluate_submission.apply_async(
            args=[str(submission.id)],
            countdown=15,
        )
    except Exception as exc:
        logger.error(
            "failed_to_queue_evaluation",
            submission_id=str(submission.id),
            error=str(exc),
        )
else:
    logger.info(
        "skipped_ai_evaluation_manual_mode",
        submission_id=str(submission.id),
        grading_mode=assignment.grading_mode.value,
    )
```

#### Phase 2: Add Auto-Approval Logic (HIGH PRIORITY)
**File**: `backend/app/tasks/grading.py`

After creating evaluation (around line 220), add:
```python
# Auto-approve if grading mode is AUTO
if assignment.grading_mode == GradingMode.AUTO:
    existing_eval.approval_status = ApprovalStatus.APPROVED
    existing_eval.final_score = existing_eval.ai_score
    existing_eval.approved_at = datetime.utcnow()
    # approved_by can be NULL for system auto-approvals
    
    logger.info(
        "evaluation_auto_approved",
        evaluation_id=str(existing_eval.id),
        grading_mode=assignment.grading_mode.value,
    )

# And for new evaluations:
if assignment.grading_mode == GradingMode.AUTO:
    evaluation.approval_status = ApprovalStatus.APPROVED
    evaluation.final_score = evaluation.ai_score
    evaluation.approved_at = datetime.utcnow()
```

#### Phase 3: Update Submission Status (MEDIUM PRIORITY)
When auto-approving, update submission status immediately:
```python
if assignment.grading_mode == GradingMode.AUTO:
    submission.status = SubmissionStatus.EVALUATED
```

#### Phase 4: Frontend Improvements (LOW PRIORITY)
Consider adding UI indicators:
- "Auto-Approved" badge on evaluations
- Show which mode was used for each evaluation
- Filter pending evaluations by grading mode

---

## Testing Checklist

After implementing fixes, test:

### Manual Mode
- [ ] Create assignment with `grading_mode='manual'`
- [ ] Submit a student submission
- [ ] Verify NO evaluation task is queued (check Celery logs)
- [ ] Verify NO evaluation record is created in database
- [ ] Verify NO Gemini API call is made (check API logs)
- [ ] Verify professor can manually create evaluation via override endpoint

### Auto Mode
- [ ] Create assignment with `grading_mode='auto'`
- [ ] Submit a student submission
- [ ] Verify evaluation task IS queued
- [ ] Verify evaluation record is created with `approval_status='approved'`
- [ ] Verify `final_score` equals `ai_score`
- [ ] Verify `approved_at` is set
- [ ] Verify student can immediately view their grade
- [ ] Verify evaluation does NOT appear in professor's pending queue

### Hybrid Mode
- [ ] Create assignment with `grading_mode='hybrid'`
- [ ] Submit a student submission
- [ ] Verify evaluation task IS queued
- [ ] Verify evaluation record is created with `approval_status='pending'`
- [ ] Verify evaluation appears in professor's pending queue
- [ ] Verify student CANNOT see grade until professor approves
- [ ] Verify professor can approve or override

---

## Database Migration

**Not required** - the schema already supports the feature. Only code logic needs to change.

---

## Backward Compatibility

### Existing Data
All existing evaluations have `approval_status='pending'`. After deploying the fix:
- Existing pending evaluations remain pending (correct)
- Future auto-mode evaluations will be auto-approved (correct)
- No data migration needed

### API Compatibility
No breaking changes:
- Endpoints remain the same
- Response schemas unchanged
- Frontend code continues to work

---

## Estimated Implementation Effort

- **Phase 1** (Conditional triggering): 30 minutes
- **Phase 2** (Auto-approval logic): 1 hour
- **Testing**: 2 hours
- **Total**: ~3-4 hours

---

## Cost/Benefit Analysis

### Current Cost (without fix)
- **API costs**: Wasted Gemini API calls on manual assignments (estimate: 30-50% waste if professors use manual mode)
- **Infrastructure**: Unnecessary Celery tasks and vector DB queries
- **User experience**: Frustrated professors in auto mode who must approve everything manually

### Benefit of Fix
- **Cost savings**: Eliminate wasted API calls for manual mode
- **User experience**: Auto mode works as intended, professors save time
- **Product quality**: Feature works as advertised in UI

### Risk
- **Low**: Logic is straightforward, well-isolated to two files
- **Rollback**: Easy - just revert the code changes

---

## Conclusion

The `grading_mode` field is currently **cosmetic only**. It's stored in the database and displayed in the UI, but has zero effect on system behavior.

**All three modes behave identically:**
1. AI evaluation always runs
2. Evaluation always requires professor approval
3. Students always wait for professor action

This defeats the purpose of having multiple grading modes and wastes resources on manual-mode assignments.

**Recommended Action**: Implement the fixes outlined in Phase 1 and Phase 2 immediately.
