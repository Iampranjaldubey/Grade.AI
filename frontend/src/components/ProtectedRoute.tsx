import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { Spinner } from "@/components/ui";
import type { UserRole } from "@/types";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user, initializeAuth } = useAuthStore();

  useEffect(() => {
    if (!user && !isLoading) {
      initializeAuth();
    }
  }, [user, isLoading, initializeAuth]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <Spinner className="h-8 w-8 text-brand" label="Checking your session" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    // Redirect to appropriate dashboard based on actual role
    if (user?.role === "professor") {
      return <Navigate to="/professor/dashboard" replace />;
    }
    if (user?.role === "student") {
      return <Navigate to="/student/dashboard" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
