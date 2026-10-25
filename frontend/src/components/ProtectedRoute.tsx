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
  const { isAuthenticated, isLoading, user, accessToken, initializeAuth } = useAuthStore();

  // After a full page load only the tokens are rehydrated from storage; the user
  // is fetched by initializeAuth in an effect, which runs *after* this first
  // render. Treat "token present, user not loaded yet" as still loading.
  // Otherwise the first render redirects to /login, the login page sees the
  // session once it resolves and sends the user to their dashboard, and every
  // refresh or shared link loses the page it was on.
  const restoringSession = !isAuthenticated && !user && Boolean(accessToken);

  useEffect(() => {
    if (!user && !isLoading) {
      initializeAuth();
    }
  }, [user, isLoading, initializeAuth]);

  if (isLoading || restoringSession) {
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
