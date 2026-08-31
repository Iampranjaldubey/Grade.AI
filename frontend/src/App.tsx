import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "@/store/authStore";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteFallback } from "@/components/RouteFallback";

// Routes are code-split so the initial load only ships the shell plus the
// screen actually being visited.
const LoginPage = lazy(() =>
  import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import("@/pages/RegisterPage").then((m) => ({ default: m.RegisterPage })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

// Professor
const ProfessorDashboard = lazy(() =>
  import("@/pages/professor/ProfessorDashboard").then((m) => ({
    default: m.ProfessorDashboard,
  })),
);
const CourseListPage = lazy(() =>
  import("@/pages/professor/CourseListPage").then((m) => ({
    default: m.CourseListPage,
  })),
);
const CourseDetailPage = lazy(() =>
  import("@/pages/professor/CourseDetailPage").then((m) => ({
    default: m.CourseDetailPage,
  })),
);
const AssignmentDetailPage = lazy(() =>
  import("@/pages/professor/AssignmentDetailPage").then((m) => ({
    default: m.AssignmentDetailPage,
  })),
);
const PendingEvaluationsPage = lazy(() =>
  import("@/pages/professor/PendingEvaluationsPage").then((m) => ({
    default: m.PendingEvaluationsPage,
  })),
);
const EvaluationReviewPage = lazy(() =>
  import("@/pages/professor/EvaluationReviewPage").then((m) => ({
    default: m.EvaluationReviewPage,
  })),
);

// Student
const StudentDashboard = lazy(() =>
  import("@/pages/student/StudentDashboard").then((m) => ({
    default: m.StudentDashboard,
  })),
);
const StudentCoursesPage = lazy(() =>
  import("@/pages/student/StudentCoursesPage").then((m) => ({
    default: m.StudentCoursesPage,
  })),
);
const StudentCourseDetailPage = lazy(() =>
  import("@/pages/student/StudentCourseDetailPage").then((m) => ({
    default: m.StudentCourseDetailPage,
  })),
);
const AssignmentSubmissionPage = lazy(() =>
  import("@/pages/student/AssignmentSubmissionPage").then((m) => ({
    default: m.AssignmentSubmissionPage,
  })),
);

function RootRedirect() {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role === "professor") {
    return <Navigate to="/professor/dashboard" replace />;
  }

  if (user?.role === "student") {
    return <Navigate to="/student/dashboard" replace />;
  }

  return <Navigate to="/login" replace />;
}

export default function App() {
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <ErrorBoundary>
      <Toaster position="top-right" />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Professor routes */}
          <Route
            path="/professor/dashboard"
            element={
              <ProtectedRoute requiredRole="professor">
                <ProfessorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/professor/courses"
            element={
              <ProtectedRoute requiredRole="professor">
                <CourseListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/professor/courses/:courseId"
            element={
              <ProtectedRoute requiredRole="professor">
                <CourseDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/professor/courses/:courseId/assignments/:assignmentId"
            element={
              <ProtectedRoute requiredRole="professor">
                <AssignmentDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/professor/evaluations"
            element={
              <ProtectedRoute requiredRole="professor">
                <PendingEvaluationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/professor/evaluations/:evaluationId"
            element={
              <ProtectedRoute requiredRole="professor">
                <EvaluationReviewPage />
              </ProtectedRoute>
            }
          />

          {/* Student routes */}
          <Route
            path="/student/dashboard"
            element={
              <ProtectedRoute requiredRole="student">
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/courses"
            element={
              <ProtectedRoute requiredRole="student">
                <StudentCoursesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/courses/:courseId"
            element={
              <ProtectedRoute requiredRole="student">
                <StudentCourseDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/assignments/:assignmentId"
            element={
              <ProtectedRoute requiredRole="student">
                <AssignmentSubmissionPage />
              </ProtectedRoute>
            }
          />

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
