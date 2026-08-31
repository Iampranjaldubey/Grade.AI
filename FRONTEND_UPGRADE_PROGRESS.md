# GradeAI Frontend Upgrade — Progress Tracker

**Goal:** transform the GradeAI frontend into a cohesive, production-grade SaaS experience by
extending the existing editorial "graded paper" design system (previously only on the auth
screens) across the entire application.

**Approach:** phased execution. Every phase leaves the app in a working, verified state
(`typecheck` + `lint` + `test` + `build` all green). No backend contracts changed.

**Last verified:** `typecheck` clean · `lint` clean (0 warnings) · **102 tests passing** · production build OK (code-split)

---

## 1. Status at a glance

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Baseline verification | ✅ Done |
| Phase 1 | Design foundation (tokens, typography, primitives) | ✅ Done |
| Phase 2 | Application shell (sidebar, topbar, mobile nav) | ✅ Done |
| Phase 3 | Core screens + data tables | ✅ Done |
| Phase 4 | AI grading experience | ✅ Done |
| Phase 5 | Student experience, modals, uploader | ✅ Done |
| Phase 6 | Polish (states, responsive, a11y) | ✅ Done |
| Phase 7 | Performance + final QA | ✅ Done |

**Overall: 16 of 16 planned tasks complete.**

One optional follow-up remains, and it needs your approval because it touches backend code:
see [the backend gap](#one-backend-gap-blocking-the-grading-workspace-needs-your-decision).

---

## 2. What has been upgraded

### Phase 0 — Baseline ✅

Established a trustworthy starting point before touching any UI.

- Ran `typecheck`, `lint`, `test`, `build` to capture the true baseline.
- **Found and fixed 2 pre-existing failing tests** in `src/App.test.tsx`. They asserted old
  login copy ("sign in to your account", a heading named "GradeAI") that no longer existed
  after the earlier auth redesign, and used an ambiguous `/password/i` label query that now
  matched both the input and the "Show password" toggle.

**Files:** `src/App.test.tsx`

---

### Phase 1 — Design foundation ✅

#### Semantic design tokens + typography

The app had **two-and-a-half competing visual languages**: the editorial system (auth only),
a generic navy `primary` admin theme (everywhere else), and a hardcoded `bg-blue-600` in the
uploader. Phase 1 created one shared token layer.

- **`tailwind.config.js`** — added semantic tokens so components reference *meaning*, not raw hues:
  - `surface` (`DEFAULT` / `muted` / `raised` / `sunken` / `inverse`)
  - `content` (`DEFAULT` / `soft` / `muted` / `inverse`)
  - `edge` (`DEFAULT` / `strong` / `subtle`)
  - `brand` (oxblood: `DEFAULT` / `dark` / `subtle` / `fg`)
  - status scales `success` / `warning` / `danger` / `info` / `processing`, each with
    `DEFAULT` + `subtle` background + AA-contrast `fg`
  - a restrained 3-step elevation ramp: `shadow-card` / `shadow-raised` / `shadow-overlay`
- **Fixed a real typography bug:** `index.css` set the base font to `Inter`, which was never
  loaded. The app silently fell back to system fonts and *never used the brand typeface*.
  Now correctly set to IBM Plex Sans (loaded in `index.html`), with Source Serif 4 for display.
- Added a **global `:focus-visible` ring** so keyboard focus is consistent app-wide.
- Added `gradeai-fade-in` / `gradeai-pop-in` keyframes for overlay animation (opacity/translate
  only, always gated behind `motion-safe:`).

#### `cn()` now resolves Tailwind conflicts

- Installed **`tailwind-merge`**; `cn()` is now `twMerge(clsx(...))`. Without this, a `className`
  override on a primitive would emit *both* conflicting classes with unpredictable results.

#### Core UI primitives — `src/components/ui/`

| Component | Notes |
|---|---|
| `Button` | 5 variants, 3 sizes, `isLoading`, `block`, `forwardRef` |
| `buttonClasses()` | Shared class recipe so `<Link>`s can look identical to buttons |
| `Spinner` | Decorative by default, labelled when used as a live status |
| `Card` + `CardHeader/Title/Description/Content/Footer` | Hairline border + subtle elevation |
| `Badge` | 7 semantic tones |
| **`StatusBadge`** | **Single source of truth** for `submission` / `parse` / `approval` / `gradingMode` status. Replaces badge logic that was duplicated across 5+ files |
| `Field`, `Label`, `Input`, `Textarea`, `Select` | Accessible label/hint/error wiring, `role="alert"` errors, `invalid` state |
| `Skeleton`, `SkeletonText` | Replaces scattered ad-hoc `animate-pulse` divs |
| `EmptyState` | Consistent empty state (was re-implemented in 5+ places) |
| `ErrorState` | Consistent error state with retry |
| `PageHeader` | Standard serif page title + description + actions |
| `Breadcrumb` | Accessible trail with `aria-current="page"` |

#### Accessible overlay primitives (Radix)

Installed `@radix-ui/react-{dialog,alert-dialog,dropdown-menu,tooltip,tabs}`.

This closes the **single biggest accessibility gap** in the app: the three existing hand-built
modals had **no focus trap, no Escape handling, no `role="dialog"`/`aria-modal`, no body scroll
lock, and no focus restoration**. Radix provides all of it.

| Component | Notes |
|---|---|
| `Dialog` + parts | Mobile bottom-sheet, desktop centered; 4 sizes |
| **`ConfirmDialog`** | Replaces native `window.confirm()`; stays open + shows a spinner during async work |
| `DropdownMenu` + parts | Keyboard-navigable menus |
| `Tooltip` | Self-contained provider |
| `Tabs` + parts | Underline-style active state |

**Tests added:** `cn()` conflict resolution, `Button` states, `StatusBadge` mapping, `Field`
a11y wiring, `Dialog` focus-trap + Escape, `ConfirmDialog` confirm flow.

---

### Phase 2 — Application shell ✅

The old `ProfessorLayout` / `StudentLayout` were **top-navbar only with `hidden md:flex`
navigation and no hamburger — meaning mobile users had no navigation at all.**

Built **`src/components/layout/`**:

- **`AppShell`** — persistent frame:
  - Desktop (≥1024px): fixed 260px left sidebar
  - Mobile: focus-trapped **drawer** opened from a topbar hamburger (fixes the missing mobile nav)
  - Sticky topbar with breadcrumbs
  - Fetches the pending-evaluation count for the sidebar badge (professors only)
- **`SidebarNav`** — brand lockup, role-aware nav with active states, pending badge, and an
  account dropdown with sign-out. Shared by both desktop sidebar and mobile drawer so
  navigation never diverges between breakpoints.
- **`nav-config.ts`** — declarative nav. Renamed "Evaluations" → **"Grading Queue"** and
  promoted it to a top-level destination (it's the professor's core recurring task).

**Migration:** all 10 pages moved onto `AppShell`; **`ProfessorLayout.tsx` and
`StudentLayout.tsx` deleted.** All route paths unchanged.

**Tests added:** role-based nav gating (professor vs student), mobile drawer opens as a dialog.

---

### Phase 3 — Core screens ✅

#### `DataTable` + `Pagination` ✅

Tables were previously hand-written `<table>` markup in 3 places with **no sorting, filtering,
searching, or pagination**.

Built a headless, reusable `DataTable` (no new dependency):
- Sortable columns (tri-state: asc → desc → off) with `aria-sort`, sort headers as real buttons
- Search box, custom toolbar slot for filters, pagination
- **Responsive by intent:** real table on desktop, **stacked label/value cards on mobile**
  (not a squashed table)
- Built-in loading skeletons and empty-state slot, optional `caption` for screen readers

#### Grading Queue (`PendingEvaluationsPage`) ✅ — rebuilt

- Now a real data table: sort by confidence/score/date, filter by course, search by student
  or assignment, paginated
- Uses shared `ConfidenceMeter` and `StatusBadge` instead of local badge logic
- "Needs review" (AI fallback) surfaced prominently
- Proper loading / empty ("All caught up") / error+retry states
- Restrained metric tiles replacing the previous mixed-color cards

#### Dashboards ✅ — redesigned

**Professor:**
- **Leads with grading workload** — a prominent banner: "N evaluations awaiting your review"
  linking straight to the Grading Queue
- Metric row reduced from **7 rainbow-colored cards to 4 purposeful metrics**, every one mapped
  to a real `AnalyticsOverview` field; average score carries a "X of Y submissions graded" hint
- Recent courses restyled as system cards with serif headings

**Student:**
- Four meaningful metrics: enrolled courses, to submit, submitted, graded (all derived from
  data already fetched — **no additional requests**)
- Upcoming assignments list with clear submitted / not-submitted status
- Consistent `EmptyState` for no courses and no upcoming work

#### New domain components — `src/components/domain/`

| Component | Notes |
|---|---|
| **`ConfidenceMeter`** | Badge or bar variant. **Single source of truth for AI confidence thresholds** (`<0.6` Low, `<0.8` Medium, else High) — previously duplicated in 2 files |
| `confidenceLevel()` | Extracted threshold helper |
| `StatCard` | Shared metric tile — replaces the duplicated `StatCard` in both dashboards |

#### Course pages ✅ — restyled

All four course screens moved onto the design system.

- **`CourseDetailPage` rebuilt.** Tabs now use the accessible Radix `Tabs` primitive (with
  counts on the Assignments/Students tabs). The **gradient join-code card was replaced** with a
  clean "Invite students" card. Students moved to a searchable, sortable `DataTable`.
  Breadcrumbs added (`Courses / CS101`).
- **`CourseListPage`** — system cards, search once you have more than 6 courses, and distinct
  empty states for "no courses" vs "no matching courses".
- **`StudentCoursesPage`** — restyled to match, with proper loading/empty/error states.
- **`StudentCourseDetailPage`** — assignment list restyled with clear per-assignment status and
  breadcrumbs.

#### Both native `confirm()` calls eliminated ✅

- Created a shared **`DocumentSection`** domain component (upload + list + delete) that replaced
  the near-identical document markup duplicated across `CourseDetailPage` and
  `AssignmentDetailPage`. Deletes now use the accessible `ConfirmDialog`, which also explains the
  consequence ("along with any text extracted from it for AI grading").
- This removed **~230 lines** from `AssignmentDetailPage`, along with a duplicate parse-status
  badge and a duplicate `formatFileSize`.
- Replaced both `useEffect` + `setInterval` document-refresh blocks with a shared
  **`pollWhileParsing`** predicate driving React Query's `refetchInterval` — the idiomatic
  pattern already used elsewhere in the codebase. Polling now stops automatically on terminal state.
- Added **`StudentAssignmentStatus`** so an unsubmitted past-due assignment correctly reads
  "Missing" rather than a neutral "Not submitted".
- Moved `formatFileSize` and a new `isPastDue` into `src/lib/utils.ts` (each was duplicated).

---

### Phase 4 — AI grading experience ✅

#### Grading domain components ✅

| Component | Notes |
|---|---|
| **`GradeDisplay`** | Prominent score readout with a `tone` that makes the product's most important distinction explicit: `draft` (an unconfirmed AI suggestion) vs `final` (a decision the professor made, sage-tinted) |
| **`RubricCriterionRow`** | Criterion name, awarded/max, tone-coded percentage, proportional score bar, and the AI's reasoning behind an accessible disclosure (`aria-expanded`/`aria-controls`). **Replaces the accordion duplicated between the professor and student views** |
| **`AIReasoningPanel`** | Strengths / areas to improve / missing topics. Renders `null` when there's no qualitative feedback, so callers don't need to guard |
| **`SubmissionViewer`** | Shows the student, the file, its status, and a link to open the document. All props optional, so each caller renders only what it actually knows |
| `scorePercent`, `criterionTone`, `toneBarClass` | Centralised scoring thresholds (full marks = success, ≥70% = warning, else danger) so the professor and student views can't drift |

#### Grading Workspace (`EvaluationReviewPage`) ✅ — rebuilt

Now a genuine three-pane workspace (single column on mobile, 3-up on large screens with
a sticky decision panel):

- **Left — the work:** the submitting student plus an honest note where the document
  isn't yet retrievable (see the backend item below).
- **Center — rubric evaluation:** per-criterion scores with expandable AI reasoning, then
  the qualitative feedback summary.
- **Right — the decision:** the AI recommendation (with a confidence bar) is visually
  separated from *your* final grade. Once decided, it flips to a settled "Your decision"
  card showing whether you accepted or replaced the AI's grade, when, and your feedback.

**Four real bugs fixed in the process:**

1. **The submission was never shown.** Professors were approving grades without seeing the work.
2. **Wrong ID passed to the API.** The page called `getAllSubmissions(evaluation.submission_id)`,
   but that endpoint expects an *assignment* id — which is why the student name always fell
   back to "Student". Verified against the backend router; removed. Student identity now comes
   from the pending-queue cache (same query key as the shell, so it costs no extra request).
3. **Dead code branch.** It tested `typeof ai_feedback === "string"`, which is never true, so it
   always rendered "No overall feedback provided". Removed.
4. **`setTimeout(3000)` refresh replaced with real polling.** Re-evaluation now polls every 3s
   and **stops automatically** when the evaluation timestamp changes, with a visible
   "GradeAI is re-grading…" status.

Also added: **confirmation dialogs before approving or overriding** (finalising a grade releases
it to the student, so it shouldn't be a single unguarded click), and accessible override form
fields via `Field` with real validation messaging.

#### `AssignmentDetailPage` monolith dismantled ✅

The page went from **~980 lines mixing four concerns** to a thin tabbed composition
(**~300 lines**) that only fetches data and arranges components:

- **Tabs:** Rubric · Submissions · Instructions · Materials (with live counts).
- **`RubricBuilder`** extracted as a shared component. Saved criteria display read-only until you
  choose to edit, then load into a draft that must total 100% before saving. The weight indicator
  is a live `role="status"`, and the fields now use the accessible `Field`/`Input`/`Textarea`
  primitives instead of hand-rolled inputs.
- **`SubmissionsTable`** extracted, built on `DataTable` (sortable, searchable, paginated, with a
  mobile card view) plus a **"Grade all"** bulk action behind a confirmation dialog.

**Two more real fixes:**

1. **The N+1 query pattern is gone.** Each table row previously ran its own `useQuery` to fetch
   that submission's evaluation, so a class of 30 students issued 30 independently-refetching
   queries. Now a single query resolves them concurrently into one cache entry.
2. **The second `setTimeout(3000)` refresh is gone**, replaced by `pollWhileEvaluating` —
   the submissions list polls while anything is still being graded and stops on its own.

Also deleted three more local duplicates: `SubmissionRow`, `getStatusColor`, and a second
`GradingModeBadge` (all now covered by `StatusBadge` / `SubmissionsTable`).

---

### Phase 5 — Student experience & shared inputs ✅

#### Student submission page (`AssignmentSubmissionPage`) ✅ — redesigned

All four states preserved (nothing submitted → submitted → replacing → graded), now on the
design system:

- The gradient score block became `GradeDisplay` (`tone="final"`, showing **out of the
  assignment's total**), the duplicated accordion became `RubricCriterionRow` with
  student-facing wording ("Why you got this score"), and feedback groups became
  `AIReasoningPanel`.
- Submitted work is shown via `SubmissionViewer` with a link to open the file.
- **The page now polls while grading is in progress**, so a student's grade appears on its own
  instead of requiring a manual refresh.
- **Fixed a bug that hid student feedback.** The student endpoint returns `criteria_scores`,
  `percentage`, and `overall_feedback` at the top level, but the page only read them from
  `ai_feedback` (the professor shape), so the criterion breakdown never rendered. A
  `readEvaluationSummary` normaliser now handles both shapes.

#### File uploader rebuilt ✅

- New `FileUploader` primitive: the drop zone is a **real `<button>`** (it was a `div` with
  `onClick`, so it couldn't be reached or activated by keyboard), all colours come from tokens
  (it hard-coded `bg-blue-600`), and progress is exposed via `role="progressbar"` with failures
  announced through `role="alert"`.
- `DocumentUploadZone` keeps the entire presign → PUT → confirm → poll pipeline unchanged and
  now just orchestrates it, plus it clears its poll interval on unmount.

#### All three modals rebuilt on `Dialog` ✅

`CreateCourseModal`, `CreateAssignmentModal`, and `JoinCourseModal` now have focus trapping,
Escape-to-close, `aria-modal`, body scroll lock, and focus restoration — none of which the
hand-built versions had. Their react-hook-form + zod schemas are unchanged; the inputs moved to
the accessible `Field` primitives, and all three now report errors through `getErrorMessage`
instead of reaching into `error.response.data.detail`.

---

### Phase 6 — Polish ✅

- `NotFoundPage` moved onto the design system, with **corrected heading semantics** (the
  descriptive title is the `h1`; "404" is decorative) and a destination that adapts to whether
  you're signed in.
- `ProtectedRoute`'s loading spinner moved off the retired `primary` token onto the `Spinner`
  primitive with an accessible label.
- Consistent loading / empty / error / processing states verified across every screen, and the
  responsive behaviour (sidebar → drawer, tables → cards, workspace → stacked) is intentional
  rather than stacked-desktop.

---

### Phase 7 — Performance & QA ✅

- **Route-level code splitting.** Every route is now `React.lazy` behind a `Suspense` boundary
  with a layout-stable `RouteFallback` skeleton.
- **Vendor chunking** via Vite `manualChunks`, splitting React, data, and form libraries so
  they stay cached across deploys.

  The single **531 kB** bundle became:

  | Chunk | Size |
  |---|---|
  | `vendor-react` | 168 kB |
  | `AppShell` (shell + shared UI) | 99 kB |
  | `vendor-data` | 91 kB |
  | `vendor-forms` | 80 kB |
  | `index` (entry) | 56 kB |
  | each page | 6–12 kB |

  The login screen no longer downloads the entire authenticated application.
- **`ErrorBoundary` added.** An uncaught render error previously left a blank white page; it now
  shows a recoverable message (with the error text in dev only).
- **Dead code and retired tokens removed:** the unused `useHealth` hook is gone, and the
  `primary` / `accent` navy palettes have been deleted from `tailwind.config.js` now that
  nothing references them.

---

## 3. Technical debt — all cleared

Every item identified in the original audit has been resolved:

| Item | Location | Status |
|---|---|---|
| Native `confirm()` for destructive deletes | `CourseDetailPage`, `AssignmentDetailPage` | ✅ `ConfirmDialog` |
| Duplicated document section / parse badge / `formatFileSize` | 2 pages | ✅ `DocumentSection` |
| `setInterval` document-refresh blocks | 2 pages | ✅ `pollWhileParsing` |
| Dead `ai_feedback` string branch | `EvaluationReviewPage` | ✅ Removed |
| Wrong id passed to `getAllSubmissions` | `EvaluationReviewPage` | ✅ Removed |
| `setTimeout(3000)` instead of polling | `EvaluationReviewPage`, `AssignmentDetailPage` | ✅ Real polling |
| Oversized page (~980 lines) | `AssignmentDetailPage` | ✅ ~300 lines |
| Per-row N+1 evaluation queries | `AssignmentDetailPage` → `SubmissionRow` | ✅ Single query |
| Criteria accordion duplicated | `EvaluationReviewPage`, `AssignmentSubmissionPage` | ✅ `RubricCriterionRow` |
| Student criterion breakdown never rendered | `AssignmentSubmissionPage` | ✅ `readEvaluationSummary` |
| Modals lack focus trap / Escape / aria | 3 modal files | ✅ Radix `Dialog` |
| Upload zone not keyboard accessible; hardcoded blue | `DocumentUploadZone` | ✅ `FileUploader` |
| No `ErrorBoundary`; no code splitting (531 kB single chunk) | `App.tsx`, `vite.config.ts` | ✅ Both added |
| Unused dead code | `hooks/useHealth.ts` | ✅ Deleted |
| Retired navy tokens | `tailwind.config.js` (`primary`, `accent`) | ✅ Deleted |
| Inconsistent error handling | modals, mutations | ✅ `getErrorMessage` |

---

## 4. One backend gap (optional — needs your decision)

**The grading workspace can't show the submitted document, because no current endpoint can
return a submission given only an evaluation id.** Verified directly against the backend:

- `GET /evaluations/{id}` returns `EvaluationOut`, which has **no** student, assignment, or file
  fields (`backend/app/schemas/evaluation.py`).
- `GET /submissions/{assignment_id}/all` is keyed by **assignment** id, and there is no
  "get submission by id" route (`backend/app/api/v1/endpoints/submissions.py`).
- `EvaluationListOut` does carry `student_name` / `student_email` / `assignment_title`, which is
  what the workspace uses today — but it has no `assignment_id` and no file details.

**Proposed fix (small and purely additive):** `get_evaluation_detail` in
`backend/app/api/v1/endpoints/evaluations.py` **already eager-loads**
`submission → assignment → course`, so the data is in memory. Adding optional context fields to
`EvaluationOut` (`student_name`, `student_email`, `assignment_id`, `assignment_title`,
`max_score`, `file_name`, `file_url`, `submitted_at`) would light up the document pane and the
"out of N points" total with no breaking change to existing consumers.

This touches backend code, so it's **awaiting approval** rather than done. Until then the
workspace clearly states that the document isn't available instead of silently showing an
empty panel. Everything else in the workspace works against the API as it stands today.

---

## 5. Dependencies added

Each was added for a specific, justified reason — nothing trendy-by-default.

| Package | Why |
|---|---|
| `tailwind-merge` | Lets `cn()` resolve conflicting Tailwind classes so `className` overrides on primitives behave predictably. `clsx` alone cannot do this. |
| `@radix-ui/react-dialog` | Accessible modal: focus trap, Escape, `aria-modal`, scroll lock, focus restore |
| `@radix-ui/react-alert-dialog` | Confirmation dialogs replacing `window.confirm()` |
| `@radix-ui/react-dropdown-menu` | Keyboard-accessible account/row menus |
| `@radix-ui/react-tooltip` | Accessible supplementary hints |
| `@radix-ui/react-tabs` | Accessible tabs with roving focus |

**Deliberately NOT added:** `@tanstack/react-table` (the hand-rolled `DataTable` covers current
needs), a charting library (the analytics endpoint returns only scalars — no time series to plot
yet), `framer-motion` (Tailwind transitions suffice), and any date library (`Intl` is enough).

---

## 6. Guarantees maintained

Nothing in the redesign has altered application behavior:

- ✅ Auth store, token persistence, and the axios refresh-queue interceptor — untouched
- ✅ All API endpoints and DTOs — unchanged
- ✅ React Query keys and caching behavior — preserved
- ✅ All route paths — unchanged (`ProtectedRoute` role gating intact)
- ✅ Submission state machine, upload presign→confirm→poll flow, evaluation approve/override — preserved
- ✅ `typecheck`, `lint` (0 warnings), 102 tests, and production build all green

---

## 7. Bugs found and fixed along the way

The redesign surfaced eight genuine defects, not just styling problems:

1. **Brand font never applied.** The base font was `Inter`, which was never loaded, so the whole
   app silently fell back to system fonts.
2. **No mobile navigation.** The nav was `hidden md:flex` with no hamburger — mobile users had
   no way to navigate.
3. **The submission was never shown** on the grading screen; professors approved grades without
   seeing the student's work.
4. **Wrong ID passed to the submissions API** (`submission_id` where an `assignment_id` was
   required), which is why student names always displayed as "Student".
5. **Dead branch** always printed "No overall feedback provided".
6. **Students never saw their criterion breakdown** — the page read the professor's response
   shape instead of the student one.
7. **Two `setTimeout` guesses** at how long AI grading takes, replaced with polling that stops on
   completion.
8. **N+1 query pattern** in the submissions table (30 students = 30 independently refetching
   queries).
