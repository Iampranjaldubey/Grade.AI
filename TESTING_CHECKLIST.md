# Manual Grading - Testing Checklist

**Date**: August 15, 2026  
**Feature**: Manual Grading Support

---

## Pre-Testing Setup

### 1. Apply Database Migration
```bash
cd backend
.venv\Scripts\activate  # Windows
alembic upgrade head
```

**Expected Output:**
```
INFO [alembic.runtime.migration] Running upgrade 87b46a5f2d9c -> bd4d6fde68e4, make ai_score nullable for manual evaluations
```

**Status**: [ ] DONE

---

## Test Suite

### Test 1: Basic Manual Grading ⭐ CRITICAL

**Setup:**
- Create course as Professor
- Create assignment with `grading_mode = "manual"`
- Student submits assignment

**Action:**
```bash
POST /api/v1/evaluations/manual/{submission_id}
Authorization: Bearer {professor_token}
Content-Type: application/json

{
  "final_score": 85.5,
  "professor_feedback": "Good analysis. Could improve formatting.",
  "criteria_scores": [
    {"criterion": "Content", "score": 40, "max": 50},
    {"criterion": "Format", "score": 45.5, "max": 50}
  ]
}
```

**Expected Result:**
- [ ] Returns 201 Created
- [ ] Response includes evaluation with:
  - [ ] `ai_score = null`
  - [ ] `final_score = 85.5`
  - [ ] `professor_feedback` matches request
  - [ ] `approval_status = "OVERRIDDEN"`
  - [ ] `approved_by = professor.id`
- [ ] Submission status updated to `EVALUATED`
- [ ] Student can view the grade

**Status**: [ ] PASS / [ ] FAIL

---

### Test 2: Duplicate Prevention

**Setup:**
- Use submission from Test 1 (already has manual evaluation)

**Action:**
```bash
POST /api/v1/evaluations/manual/{submission_id}
Authorization: Bearer {professor_token}
Content-Type: application/json

{
  "final_score": 90,
  "professor_feedback": "Trying to grade again"
}
```

**Expected Result:**
- [ ] Returns 409 Conflict
- [ ] Error message: "Evaluation already exists for this submission. Use /override endpoint to modify it."
- [ ] Original evaluation unchanged in database

**Status**: [ ] PASS / [ ] FAIL

---

### Test 3: AI Protection ⭐ CRITICAL

**Setup:**
- Use submission from Test 1 (manually graded, ai_score=NULL)

**Action:**
Trigger AI evaluation through either:
- Backend task: `evaluate_submission.delay(str(submission_id))`
- OR re-queue submission for grading

**Expected Result:**
- [ ] Task completes without error
- [ ] Evaluation remains unchanged:
  - [ ] `ai_score` still NULL
  - [ ] `final_score` still 85.5
  - [ ] `professor_feedback` unchanged
- [ ] Backend logs contain warning:
  ```
  skipped_ai_overwrite_of_manual_evaluation
  evaluation_id={evaluation_id}
  submission_id={submission_id}
  ```
- [ ] Task returns: `{"status": "skipped", "reason": "manual_evaluation_exists"}`

**Status**: [ ] PASS / [ ] FAIL

---

### Test 4: Score Validation

**Setup:**
- Create assignment with `max_score = 100`
- Student submits

**Action:**
```bash
POST /api/v1/evaluations/manual/{submission_id}
Authorization: Bearer {professor_token}
Content-Type: application/json

{
  "final_score": 150,
  "professor_feedback": "Excellent work!"
}
```

**Expected Result:**
- [ ] Returns 400 Bad Request
- [ ] Error message: "Final score (150) exceeds assignment max score (100)"
- [ ] No evaluation created

**Status**: [ ] PASS / [ ] FAIL

---

### Test 5: Cannot Approve Manual Evaluations

**Setup:**
- Use evaluation from Test 1 (ai_score=NULL)

**Action:**
```bash
POST /api/v1/evaluations/{evaluation_id}/approve
Authorization: Bearer {professor_token}
```

**Expected Result:**
- [ ] Returns 400 Bad Request
- [ ] Error message: "Cannot approve evaluation without AI score. Use /override to set a manual score."
- [ ] Evaluation unchanged

**Status**: [ ] PASS / [ ] FAIL

---

### Test 6: AI Re-Evaluation Still Works

**Setup:**
- Create assignment with `grading_mode = "auto"`
- Student submits
- Wait for AI to evaluate (ai_score=80, final_score=80, approval_status=APPROVED)

**Action:**
Trigger AI re-evaluation on same submission

**Expected Result:**
- [ ] Task completes successfully
- [ ] Evaluation can be updated (ai_score not NULL, so not protected)
- [ ] New ai_score applied (may be different)
- [ ] No warning about manual evaluation
- [ ] Normal AI evaluation flow works

**Status**: [ ] PASS / [ ] FAIL

---

### Test 7: Authorization - Professor Must Own Course

**Setup:**
- Professor A creates course and assignment
- Student submits
- Get token for Professor B (different professor)

**Action:**
```bash
POST /api/v1/evaluations/manual/{submission_id}
Authorization: Bearer {professor_b_token}
Content-Type: application/json

{
  "final_score": 90,
  "professor_feedback": "Trying to grade another professor's assignment"
}
```

**Expected Result:**
- [ ] Returns 403 Forbidden
- [ ] Error message: "Not authorized to grade this submission"
- [ ] No evaluation created

**Status**: [ ] PASS / [ ] FAIL

---

### Test 8: AUTO Mode Still Works

**Setup:**
- Create assignment with `grading_mode = "auto"`
- Student submits

**Action:**
Wait for AI evaluation to complete automatically

**Expected Result:**
- [ ] AI evaluation task runs
- [ ] Evaluation created with:
  - [ ] `ai_score` populated (not NULL)
  - [ ] `final_score = ai_score`
  - [ ] `approval_status = "APPROVED"` (auto-approved)
- [ ] Submission status = EVALUATED
- [ ] No professor action required

**Status**: [ ] PASS / [ ] FAIL

---

### Test 9: HYBRID Mode Still Works

**Setup:**
- Create assignment with `grading_mode = "hybrid"`
- Student submits

**Action:**
1. Wait for AI evaluation
2. Professor approves or overrides

**Expected Result:**
- [ ] AI evaluation task runs
- [ ] Evaluation created with:
  - [ ] `ai_score` populated (not NULL)
  - [ ] `approval_status = "PENDING"`
- [ ] Professor can approve via `/evaluations/{id}/approve`
- [ ] Professor can override via `/evaluations/{id}/override`

**Status**: [ ] PASS / [ ] FAIL

---

### Test 10: Override Endpoint Logging Works

**Setup:**
- Use any evaluation (manual or AI-generated)

**Action:**
```bash
POST /api/v1/evaluations/{evaluation_id}/override
Authorization: Bearer {professor_token}
Content-Type: application/json

{
  "final_score": 92,
  "professor_feedback": "Adjusted score after review"
}
```

**Expected Result:**
- [ ] Returns 200 OK
- [ ] Evaluation updated
- [ ] No TypeError in logs (even if ai_score=NULL)
- [ ] Log entry shows:
  ```
  evaluation_overridden
  evaluation_id={id}
  professor_id={prof_id}
  ai_score=null  # if manual, otherwise float value
  final_score=92.0
  ```

**Status**: [ ] PASS / [ ] FAIL

---

## Integration Tests

### INT-1: Frontend Display

**Action:**
- View manual evaluation in frontend as student
- View manual evaluation in frontend as professor

**Expected Result:**
- [ ] Student sees final_score and professor_feedback
- [ ] Frontend handles null ai_score gracefully (doesn't show "AI Score: null")
- [ ] Professor sees complete evaluation details
- [ ] No console errors

**Status**: [ ] PASS / [ ] FAIL

---

### INT-2: Analytics/Reports

**Action:**
- Generate any reports that include evaluation data

**Expected Result:**
- [ ] Reports handle null ai_score gracefully
- [ ] No division by zero or null pointer errors
- [ ] Manual evaluations included in statistics appropriately

**Status**: [ ] PASS / [ ] FAIL

---

## Performance Tests (Optional)

### PERF-1: Query Performance

**Action:**
Run typical evaluation queries with nullable ai_score

**Expected Result:**
- [ ] No significant performance degradation
- [ ] Indexes still used appropriately
- [ ] Response times acceptable

**Status**: [ ] PASS / [ ] FAIL / [ ] SKIPPED

---

## Regression Tests

### REG-1: Existing AUTO Assignments

**Action:**
- Test existing auto-graded assignments
- Submit new work to old auto assignments

**Expected Result:**
- [ ] All existing evaluations still accessible
- [ ] New submissions to old assignments work correctly
- [ ] No behavioral changes

**Status**: [ ] PASS / [ ] FAIL

---

### REG-2: Existing HYBRID Assignments

**Action:**
- Test existing hybrid assignments
- Submit new work to old hybrid assignments

**Expected Result:**
- [ ] Pending evaluations still show correctly
- [ ] Approve/override endpoints still work
- [ ] New submissions work correctly

**Status**: [ ] PASS / [ ] FAIL

---

## Final Checks

- [ ] All CRITICAL tests passed
- [ ] No new errors in backend logs
- [ ] No new errors in frontend console
- [ ] Database migration successfully applied
- [ ] Rollback plan documented and understood
- [ ] Monitoring/alerting configured (if applicable)

---

## Sign-Off

**Tested By**: ___________________  
**Date**: ___________________  
**Overall Status**: [ ] PASS / [ ] FAIL  
**Approved for Production**: [ ] YES / [ ] NO

**Notes**:
```
(Add any notes about issues found, edge cases discovered, or additional testing needed)
```

---

## Quick Commands Reference

### Apply Migration
```bash
cd backend
.venv\Scripts\activate
alembic upgrade head
```

### Check Migration Status
```bash
alembic current
alembic heads
```

### Rollback Migration
```bash
alembic downgrade 87b46a5f2d9c
```

### View Backend Logs
```bash
# Depends on your logging setup
tail -f logs/app.log
# OR check Docker logs, systemd journal, etc.
```

---

*Last Updated: August 15, 2026*
