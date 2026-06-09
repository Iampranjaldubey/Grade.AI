# Phase 3 Testing Checklist

## 🚀 Quick Start

Ensure backend and frontend are running:
```bash
# Terminal 1 - Backend
cd backend
uvicorn app.main:app --reload

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Access: `http://localhost:5173`

---

## ✅ Professor Tests

### Test 1: Course Detail - Overview Tab
- [ ] Login as professor
- [ ] Navigate to "Courses"
- [ ] Click on any course card
- [ ] **Verify Overview Tab:**
  - [ ] Course info card displays correctly
  - [ ] Join code is visible (6 uppercase alphanumeric chars)
  - [ ] Click copy button → toast shows "Join code copied!"
  - [ ] Stats cards show correct counts
  - [ ] All information is properly formatted

### Test 2: Course Detail - Assignments Tab
- [ ] Click "Assignments" tab
- [ ] **If no assignments:**
  - [ ] Empty state displays with "Create Assignment" button
- [ ] Click "New Assignment" button
- [ ] **In modal, fill:**
  - Title: "Homework 1"
  - Description: "First assignment"
  - Due Date: Tomorrow at 11:59 PM
  - Max Score: 100
  - Grading Mode: Auto
- [ ] Click "Create Assignment"
- [ ] **Verify:**
  - [ ] Success toast appears
  - [ ] Modal closes
  - [ ] Assignment card appears in grid
  - [ ] Card shows: title, due date, max score, "auto" badge, 0 submissions
  - [ ] Hover effect works

### Test 3: Assignment Detail Page
- [ ] Click on the assignment card
- [ ] **Verify Left Column:**
  - [ ] Title displays
  - [ ] Description shows
  - [ ] Due date formatted correctly
  - [ ] Max score shows
  - [ ] Status shows "Open" (in green)
  - [ ] Grading mode badge displays
- [ ] **Verify Right Column - Rubric Builder:**
  - [ ] "Grading Rubric" header
  - [ ] Weight indicator shows "0/100%" in red with alert icon

### Test 4: Add Rubric Criteria
- [ ] Click "Add Criterion" button
- [ ] **Fill first criterion:**
  - Criteria Name: "Code Quality"
  - Description: "Clean, readable code"
  - Max Points: 40
  - Weight: 40
  - Evaluation Hints: "Check for comments and structure"
- [ ] Click "Add Criterion" button (in form)
- [ ] **Verify:**
  - [ ] Criterion card appears in blue background
  - [ ] Shows "40%" on right side
  - [ ] Trash icon appears
  - [ ] Weight indicator updates to "40/100%" (still red)
- [ ] Repeat to add two more criteria:
  - "Documentation" (30 points, 30%)
  - "Testing" (30 points, 30%)
- [ ] **Verify:**
  - [ ] All 3 criteria display
  - [ ] Weight indicator shows "100/100%" in green with checkmark
  - [ ] "Save Rubric" button appears

### Test 5: Save Rubrics
- [ ] Click "Save Rubric" button
- [ ] **Verify:**
  - [ ] Loading state shows "Saving..."
  - [ ] Success toast: "Rubrics saved successfully!"
  - [ ] Rubric cards change to gray background (saved state)
  - [ ] "Edit Rubrics" button appears

### Test 6: Edit Rubrics
- [ ] Click "Edit Rubrics" button
- [ ] **Verify:**
  - [ ] All 3 criteria load back into editable mode (blue cards)
  - [ ] Can add more criteria
  - [ ] Can remove criteria with trash icon
- [ ] Try changing weights to NOT equal 100 (e.g., 40, 30, 20 = 90)
- [ ] Click "Save Rubric"
- [ ] **Verify:**
  - [ ] Error toast: "Total weight must equal 100% (currently 90.00%)"
  - [ ] Rubrics NOT saved
- [ ] Fix the weight (make last one 40 instead of 20)
- [ ] Click "Save Rubric"
- [ ] **Verify:**
  - [ ] Success toast
  - [ ] Rubrics saved

### Test 7: Course Detail - Students Tab
- [ ] Go back to course detail (click "Courses" → click course)
- [ ] Click "Students" tab
- [ ] **If no students:**
  - [ ] Empty state displays
  - [ ] Message about join code in Overview tab
- [ ] **If students enrolled (from student test below):**
  - [ ] Table displays with columns: Student, Email, Enrolled, Submissions
  - [ ] Data is properly formatted

### Test 8: Multiple Assignments
- [ ] Go to Assignments tab
- [ ] Create 2-3 more assignments with different:
  - Due dates (some past, some future)
  - Grading modes (manual, hybrid)
  - Max scores
- [ ] **Verify:**
  - [ ] Past-due assignments show red date
  - [ ] Different grading mode badges (blue for manual, purple for hybrid)
  - [ ] All cards display correctly

---

## ✅ Student Tests

### Test 9: Student Dashboard
- [ ] Logout from professor account
- [ ] Register new student account
- [ ] **Verify Dashboard:**
  - [ ] "Welcome back, {FirstName}" header
  - [ ] 2 stat cards: "Enrolled Courses: 0", "Pending Submissions: 0"
  - [ ] Empty state for courses
  - [ ] "Join a Course" button visible
  - [ ] "Upcoming Assignments" section (placeholder)

### Test 10: Join a Course
- [ ] Click "Join a Course" button
- [ ] **In modal:**
  - [ ] Large input field for join code
  - [ ] Placeholder "ABC123"
  - [ ] Helper text below input
- [ ] Enter invalid code (e.g., "INVALID")
- [ ] Click "Join Course"
- [ ] **Verify:**
  - [ ] Error toast: "No active course found with that join code"
- [ ] Enter the correct join code from professor's course
- [ ] Click "Join Course"
- [ ] **Verify:**
  - [ ] Success toast: "Successfully joined {CourseName}!"
  - [ ] Modal closes
  - [ ] Course appears in dashboard (stat card updates to 1)
  - [ ] Course card shows in "My Courses" section

### Test 11: Student Courses Page
- [ ] Click "My Courses" in navigation
- [ ] **Verify:**
  - [ ] Page header "My Courses"
  - [ ] "Join Course" button in header
  - [ ] Course card displays with:
    - [ ] Course name
    - [ ] Course code
    - [ ] Semester
    - [ ] Description (if set)
    - [ ] Enrollment date
  - [ ] Hover effect on card

### Test 12: Join Another Course
- [ ] Click "Join Course" button
- [ ] Enter another valid join code
- [ ] **Verify:**
  - [ ] Success
  - [ ] New course appears
  - [ ] Enrolled Courses stat updates
- [ ] Try joining the same course again
- [ ] **Verify:**
  - [ ] Error toast: "You are already enrolled in this course"

### Test 13: Student Dashboard with Courses
- [ ] Click "Dashboard" in navigation
- [ ] **Verify:**
  - [ ] Enrolled Courses stat shows correct count (e.g., 2)
  - [ ] Top 3 courses display in cards
  - [ ] If more than 3 courses: "View all courses →" link appears
  - [ ] Each card shows course name, code, semester

---

## ✅ Edge Cases & Error Handling

### Test 14: Navigation & Routing
- [ ] As professor, try accessing `/student/dashboard` directly
  - [ ] Should redirect to `/professor/dashboard`
- [ ] As student, try accessing `/professor/dashboard` directly
  - [ ] Should redirect to `/student/dashboard`
- [ ] Logout and try accessing protected routes
  - [ ] Should redirect to `/login`

### Test 15: Loading States
- [ ] Slow down network (Chrome DevTools → Network → Slow 3G)
- [ ] Navigate to various pages
- [ ] **Verify:**
  - [ ] Skeleton loaders appear
  - [ ] No flash of empty content
  - [ ] Smooth transition to loaded state

### Test 16: Responsive Design
- [ ] Resize browser to mobile width (< 768px)
- [ ] **Verify:**
  - [ ] Course cards stack (1 column)
  - [ ] Assignment cards stack (1 column)
  - [ ] Tables scroll horizontally
  - [ ] Modals fit on screen
  - [ ] Navigation is usable
- [ ] Resize to tablet (768px - 1024px)
  - [ ] 2 columns where appropriate
- [ ] Resize to desktop (> 1024px)
  - [ ] 3 columns where appropriate

### Test 17: Form Validation
- [ ] Try creating assignment with empty title
  - [ ] Error message shows
- [ ] Try creating assignment with past due date
  - [ ] Backend should return error (may need to test with API)
- [ ] Try saving rubrics with negative weights
  - [ ] Should show validation error
- [ ] Try joining course with empty code
  - [ ] Error message shows

### Test 18: Data Persistence
- [ ] Create a course
- [ ] Create assignments
- [ ] Add rubrics
- [ ] Refresh the page (F5)
- [ ] **Verify:**
  - [ ] All data persists
  - [ ] Auth token still valid
  - [ ] No need to re-login

---

## 🐛 Common Issues & Solutions

**Issue:** Modals don't close
- **Check:** Click backdrop, not the modal content
- **Fix:** Ensure mutations aren't pending

**Issue:** Rubric weight validation fails at exactly 100%
- **Check:** Floating point precision
- **Fix:** Code uses 0.01 tolerance (Math.abs(total - 100) < 0.01)

**Issue:** Join code copy doesn't work
- **Check:** Browser permissions for clipboard
- **Fix:** Ensure HTTPS or localhost (clipboard API requirement)

**Issue:** Assignment cards show wrong submission count
- **Check:** Backend returns correct data
- **Verify:** Check Network tab for API response

**Issue:** Students tab is empty even with enrolled students
- **Check:** Enrollment status is "active" (not "dropped")
- **Verify:** Backend GET /api/v1/courses/{id}/students returns data

---

## ✅ Success Criteria

**All tests passed when:**
- [ ] Professor can create courses and assignments
- [ ] Professor can build rubrics with weight validation
- [ ] Professor can view enrolled students
- [ ] Students can join courses with join codes
- [ ] Students can view their enrolled courses
- [ ] All loading states work correctly
- [ ] All error states display properly
- [ ] All toast notifications appear
- [ ] Responsive design works on all screen sizes
- [ ] No TypeScript errors in console
- [ ] No network errors in console
- [ ] Navigation and routing work correctly
- [ ] Data persists across page reloads

---

## 📊 Test Results

Date tested: _____________

Tester: _____________

**Results:**
- Total tests: 18
- Passed: ____
- Failed: ____
- Issues found: ____

**Notes:**
_______________________________________________________
_______________________________________________________
_______________________________________________________

---

## 🚀 Next Steps After Testing

If all tests pass:
1. ✅ Phase 3 is complete
2. ✅ Ready to start Phase 4 (Submissions & Grading)
3. ✅ See `PHASE3_IMPLEMENTATION.md` for detailed documentation

If tests fail:
1. Note which tests failed
2. Check console for errors
3. Verify backend is running correctly
4. Check API endpoints in `http://localhost:8000/docs`
5. Review error messages in toast notifications
