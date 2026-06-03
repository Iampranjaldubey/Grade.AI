import { create } from "zustand";
import type { User } from "@/types";
import * as authApi from "@/lib/auth";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.login({ email, password });
      const user = await authApi.getCurrentUser();
      set({ user, isLoading: false });
    } catch {
      set({ error: "Invalid email or password", isLoading: false });
      throw new Error("Login failed");
    }
  },

  logout: () => {
    authApi.logout();
    set({ user: null });
  },

  fetchUser: async () => {
    if (!authApi.isAuthenticated()) {
      set({ user: null });
      return;
    }
    set({ isLoading: true });
    try {
      const user = await authApi.getCurrentUser();
      set({ user, isLoading: false });
    } catch {
      authApi.logout();
      set({ user: null, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
