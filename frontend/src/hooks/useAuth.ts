import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

export function useAuth() {
  const { user, isLoading, error, login, logout, fetchUser, clearError } =
    useAuthStore();

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  return {
    user,
    isLoading,
    error,
    isAuthenticated: Boolean(user),
    login,
    logout,
    clearError,
  };
}
