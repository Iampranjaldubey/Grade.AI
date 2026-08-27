import { describe, expect, it, beforeEach, vi } from "vitest";
import type { TokenResponse, UserOut } from "@/types";

// Mock the API module the store depends on.
vi.mock("@/lib/api", () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshAccessToken: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import * as api from "@/lib/api";
import { useAuthStore } from "./authStore";

const mockUser: UserOut = {
  id: "u1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "professor",
  is_active: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

const mockTokens: TokenResponse = {
  access_token: "access-123",
  refresh_token: "refresh-456",
  token_type: "bearer",
  expires_in: 3600,
  user: mockUser,
};

function resetStore() {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });
}

describe("authStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetStore();
  });

  it("logs in successfully and persists tokens", async () => {
    vi.mocked(api.login).mockResolvedValue(mockTokens);

    await useAuthStore.getState().login("ada@example.com", "pw");

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.email).toBe("ada@example.com");
    expect(state.error).toBeNull();
    expect(localStorage.getItem("gradeai_access_token")).toBe("access-123");
    expect(localStorage.getItem("gradeai_refresh_token")).toBe("refresh-456");
  });

  it("records an error and rethrows on failed login", async () => {
    vi.mocked(api.login).mockRejectedValue(new Error("bad creds"));

    await expect(
      useAuthStore.getState().login("ada@example.com", "wrong"),
    ).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe("Invalid email or password");
    expect(state.isLoading).toBe(false);
  });

  it("clears the error message", () => {
    useAuthStore.setState({ error: "something" });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });

  it("initializeAuth is a no-op when there is no access token", async () => {
    await useAuthStore.getState().initializeAuth();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(api.getCurrentUser).not.toHaveBeenCalled();
  });

  it("initializeAuth loads the current user when a token exists", async () => {
    useAuthStore.setState({ accessToken: "access-123" });
    vi.mocked(api.getCurrentUser).mockResolvedValue(mockUser);

    await useAuthStore.getState().initializeAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.email).toBe("ada@example.com");
  });

  it("initializeAuth clears auth when the token is invalid", async () => {
    useAuthStore.setState({ accessToken: "stale" });
    localStorage.setItem("gradeai_access_token", "stale");
    vi.mocked(api.getCurrentUser).mockRejectedValue(new Error("401"));

    await useAuthStore.getState().initializeAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(localStorage.getItem("gradeai_access_token")).toBeNull();
  });

  it("registers successfully and stores tokens", async () => {
    vi.mocked(api.register).mockResolvedValue(mockTokens);

    await useAuthStore.getState().register("Ada", "ada@example.com", "password1", "professor");

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(api.register).toHaveBeenCalledWith({
      name: "Ada",
      email: "ada@example.com",
      password: "password1",
      role: "professor",
    });
  });

  it("surfaces a backend detail message on failed registration", async () => {
    vi.mocked(api.register).mockRejectedValue({
      response: { data: { detail: "Email already registered" } },
    });

    await expect(
      useAuthStore.getState().register("Ada", "ada@example.com", "pw", "student"),
    ).rejects.toBeTruthy();

    expect(useAuthStore.getState().error).toBe("Email already registered");
  });

  it("refreshAccessToken updates stored tokens", async () => {
    useAuthStore.setState({ refreshToken: "old-refresh" });
    vi.mocked(api.refreshAccessToken).mockResolvedValue({
      ...mockTokens,
      access_token: "new-access",
      refresh_token: "new-refresh",
    });

    await useAuthStore.getState().refreshAccessToken();

    expect(useAuthStore.getState().accessToken).toBe("new-access");
    expect(localStorage.getItem("gradeai_refresh_token")).toBe("new-refresh");
  });

  it("refreshAccessToken throws when no refresh token is present", async () => {
    await expect(useAuthStore.getState().refreshAccessToken()).rejects.toThrow();
  });
});
