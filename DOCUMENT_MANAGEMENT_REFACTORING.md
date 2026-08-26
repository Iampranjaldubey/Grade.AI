# Document Management Refactoring Summary

## Overview
Fixed architectural inconsistency in document management by aligning the frontend UI with backend data architecture. Documents are now organized by their actual scope (course-level vs assignment-level).

## Problem Statement
Previously, all document types (Lecture Notes, Rubric Documents, Sample Solutions) were displayed in the Course → Documents page. However, the backend architecture distinguishes between:
- **Course-level documents**: Lecture Notes (assignment_id is NULL)
- **Assignment-level documents**: Rubric Documents and Sample Solutions (assignment_id is required)

The `RetrievalService` in the RAG pipeline retrieves rubric documents and sample solutions using `assignment_id`, confirming they logically belong to assignments rather than courses.

## Changes Made

### 1. CourseDetailPage.tsx
**Location**: `frontend/src/pages/professor/CourseDetailPage.tsx`

**Changes**:
- Removed Rubric Documents section from Documents tab
- Removed Sample Solutions section from Documents tab
- Kept only Lecture Notes section (course-level documents)
- Added informational note directing users to assignment pages for assignment-specific documents
- Updated `DocumentSection` component to accept optional `assignmentId` prop

**Result**: Course page now only shows course-level documents (Lecture Notes without assignment_id).

### 2. AssignmentDetailPage.tsx
**Location**: `frontend/src/pages/professor/AssignmentDetailPage.tsx`

**Changes**:
- Added imports: `useEffect`, `uploadsApi`, `DocumentUploadZone`, `FolderOpen`, `Check` icons
- Added new types: `DocumentOut`, `ParseStatus`
- Added documents query that fetches and filters course documents by assignment_id
- Added new `AssignmentDocumentsSection` component after Submissions section
- Created supporting components:
  - `AssignmentDocumentSection`: Handles upload/display for one document type
  - `AssignmentDocumentItem`: Displays individual document with delete button
  - `AssignmentParseStatusBadge`: Shows document processing status

**Result**: Assignment page now shows assignment-specific documents (Rubric Documents and Sample Solutions with assignment_id).

## Component Reuse

### Reused Components
- **DocumentUploadZone**: Already supports optional `assignmentId` prop - no changes needed
- **Document listing pattern**: Replicated the same structure from CourseDetailPage
- **API endpoints**: Used existing `uploadsApi.getCourseDocuments()` and filtered by assignment_id

### No Backend Changes Required
- Backend API already supports assignment_id in document upload/retrieval
- Backend correctly stores assignment_id for rubric docs and sample solutions
- RetrievalService already queries by assignment_id for these document types

## Data Flow

### Course-Level Documents (Lecture Notes)
```
CourseDetailPage → DocumentSection
  ↓
DocumentUploadZone (courseId only, no assignmentId)
  ↓
uploadsApi.presign({courseId, doc_type: "notes"})
  ↓
Backend stores with assignment_id = NULL
```

### Assignment-Level Documents (Rubric Docs, Sample Solutions)
```
AssignmentDetailPage → AssignmentDocumentsSection → AssignmentDocumentSection
  ↓
DocumentUploadZone (courseId + assignmentId)
  ↓
uploadsApi.presign({courseId, assignmentId, doc_type: "rubric"/"sample_solution"})
  ↓
Backend stores with assignment_id = <assignment_id>
  ↓
RetrievalService retrieves using assignment_id for RAG evaluation
```

## Features Preserved

All existing functionality remains intact:
- ✅ Document upload with progress tracking
- ✅ Parse status polling (pending → processing → success/failed)
- ✅ Auto-refresh when documents are processing
- ✅ Document deletion with confirmation
- ✅ File size display
- ✅ Document type filtering
- ✅ Upload cancellation
- ✅ Error handling and toast notifications

## User Experience

### Before
- Professor uploads all documents in Course → Documents
- Confusion about which documents belong to which assignment
- No clear separation between course-wide and assignment-specific materials

### After
- Professor uploads Lecture Notes in **Course → Documents** (course-wide materials)
- Professor uploads Rubric Documents and Sample Solutions in **Assignment → Documents** (assignment-specific materials)
- Clear separation aligns with mental model and RAG retrieval logic
- Informational note in Course page guides users to assignment pages

## Alignment with RAG Architecture

The refactoring ensures the UI matches the RAG pipeline's document retrieval logic:

1. **Lecture Notes** (course-level):
   - Stored without assignment_id
   - Retrieved for general course context
   - Available across all assignments in the course

2. **Rubric Documents** (assignment-level):
   - Stored with assignment_id
   - Retrieved by RetrievalService using `assignment_id`
   - Used for assignment-specific grading criteria

3. **Sample Solutions** (assignment-level):
   - Stored with assignment_id
   - Retrieved by RetrievalService using `assignment_id`
   - Used as reference examples for grading

## Testing Recommendations

### Manual Testing Checklist
- [ ] Navigate to Course → Documents
  - [ ] Verify only "Lecture Notes" section is visible
  - [ ] Upload a lecture note (no assignment_id)
  - [ ] Verify informational note is displayed
- [ ] Navigate to Assignment → Documents
  - [ ] Verify "Rubric Documents" section is visible
  - [ ] Verify "Sample Solutions" section is visible
  - [ ] Upload a rubric document (with assignment_id)
  - [ ] Upload a sample solution (with assignment_id)
  - [ ] Verify parse status updates automatically
  - [ ] Delete a document
  - [ ] Verify documents persist on page refresh
- [ ] Test document retrieval in grading flow
  - [ ] Submit a student submission
  - [ ] Trigger evaluation
  - [ ] Verify RAG retrieves correct assignment-specific documents

### Database Verification
```sql
-- Lecture notes should have NULL assignment_id
SELECT * FROM documents WHERE doc_type = 'notes' AND assignment_id IS NULL;

-- Rubric docs should have assignment_id
SELECT * FROM documents WHERE doc_type = 'rubric' AND assignment_id IS NOT NULL;

-- Sample solutions should have assignment_id
SELECT * FROM documents WHERE doc_type = 'sample_solution' AND assignment_id IS NOT NULL;
```

## Migration Notes

### For Existing Data
If there are existing rubric documents or sample solutions incorrectly stored with NULL assignment_id:
1. Identify affected documents
2. Update assignment_id to correct assignment
3. Or delete and re-upload through the new UI

### No Breaking Changes
- API endpoints unchanged
- Backend logic unchanged
- Database schema unchanged
- Only UI organization changed

## Summary

This refactoring aligns the frontend document management UI with the backend architecture and RAG retrieval logic. Documents are now organized by their actual scope:
- **Course-level**: Lecture Notes (available to all assignments)
- **Assignment-level**: Rubric Documents and Sample Solutions (specific to each assignment)

The changes preserve all existing functionality while providing a clearer, more logical user experience that matches the system's data model and retrieval patterns.
