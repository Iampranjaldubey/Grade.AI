import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "@/store/authStore";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Auth pages
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";

// Professor pages
import { ProfessorDashboard } from "@/pages/professor/ProfessorDashboard";
import { CourseListPage } from "@/pages/professor/CourseListPage";
import { CourseDetailPage } from "@/pages/professor/CourseDetailPage";
import { AssignmentDetailPage } from "@/pages/professor/AssignmentDetailPage";

// Student pages
import { StudentDashboard } from "@/pages/student/StudentDashboard";
import { StudentCoursesPage } from "@/pages/student/StudentCoursesPage";

// Other
import { NotFoundPage } from "@/pages/NotFoundPage";

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
    <>
      <Toaster position="top-right" />
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

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
