import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { UserOut } from "@/types";

vi.mock("@/lib/api", () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshAccessToken: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import * as api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { ProtectedRoute } from "./ProtectedRoute";

const professor: UserOut = {
  id: "u1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "professor",
  is_active: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route
          path="/professor/evaluations/:id"
          element={
            <ProtectedRoute requiredRole="professor">
              <p>review page</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("keeps a deep link after a full page reload instead of bouncing to login", async () => {
    // State right after a reload: tokens rehydrated from storage, user not yet fetched.
    useAuthStore.setState({
      user: null,
      accessToken: "persisted-token",
      refreshToken: "persisted-refresh",
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    vi.mocked(api.getCurrentUser).mockResolvedValue(professor);

    renderAt("/professor/evaluations/123");

    expect(await screen.findByText("review page")).toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });

  it("redirects to login when there is no session", async () => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });

    renderAt("/professor/evaluations/123");

    expect(await screen.findByText("login page")).toBeInTheDocument();
    expect(api.getCurrentUser).not.toHaveBeenCalled();
  });

  it("redirects to login when the persisted token is rejected", async () => {
    useAuthStore.setState({
      user: null,
      accessToken: "expired-token",
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    vi.mocked(api.getCurrentUser).mockRejectedValue(new Error("401"));

    renderAt("/professor/evaluations/123");

    expect(await screen.findByText("login page")).toBeInTheDocument();
  });
});
