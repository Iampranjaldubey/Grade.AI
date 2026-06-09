import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as api from "@/lib/api";
import type { UserOut } from "@/types";

interface AuthState {
  user: UserOut | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: "professor" | "student") => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.login({ email, password });
          
          // Store tokens in localStorage (for interceptor access)
          localStorage.setItem("gradeai_access_token", response.access_token);
          localStorage.setItem("gradeai_refresh_token", response.refresh_token);

          set({
            user: response.user,
            accessToken: response.access_token,
            refreshToken: response.refresh_token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: unknown) {
          set({ isLoading: false, error: "Invalid email or password" });
          throw error;
        }
      },

      register: async (name: string, email: string, password: string, role: "professor" | "student") => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.register({ name, email, password, role });
          
          // Store tokens in localStorage
          localStorage.setItem("gradeai_access_token", response.access_token);
          localStorage.setItem("gradeai_refresh_token", response.refresh_token);

          set({
            user: response.user,
            accessToken: response.access_token,
            refreshToken: response.refresh_token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: unknown) {
          const err = error as { response?: { data?: { detail?: string } } };
          const message = err.response?.data?.detail || "Registration failed";
          set({ isLoading: false, error: message });
          throw error;
        }
      },

      logout: async () => {
        const { refreshToken } = get();
        try {
          if (refreshToken) {
            await api.logout(refreshToken);
          }
        } catch {
          // Ignore errors on logout
        } finally {
          localStorage.removeItem("gradeai_access_token");
          localStorage.removeItem("gradeai_refresh_token");
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            error: null,
          });
          window.location.href = "/login";
        }
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          throw new Error("No refresh token available");
        }

        try {
          const response = await api.refreshAccessToken(refreshToken);
          
          localStorage.setItem("gradeai_access_token", response.access_token);
          localStorage.setItem("gradeai_refresh_token", response.refresh_token);

          set({
            accessToken: response.access_token,
            refreshToken: response.refresh_token,
          });
        } catch (error) {
          // Refresh failed, logout
          await get().logout();
          throw error;
        }
      },

      initializeAuth: async () => {
        const { accessToken } = get();
        
        if (!accessToken) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        set({ isLoading: true });
        try {
          const user = await api.getCurrentUser();
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          // Token invalid, clear auth
          localStorage.removeItem("gradeai_access_token");
          localStorage.removeItem("gradeai_refresh_token");
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "gradeai-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);
