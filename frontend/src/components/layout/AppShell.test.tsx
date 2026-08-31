import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./AppShell";
import { useAuthStore } from "@/store/authStore";
import type { UserOut } from "@/types";

function makeUser(role: UserOut["role"]): UserOut {
  return {
    id: "u1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    role,
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

function renderShell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppShell breadcrumbs={[{ label: "Dashboard" }]}>
          <p>Page content</p>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it("shows the professor navigation including the grading queue", () => {
    useAuthStore.setState({ user: makeUser("professor"), isAuthenticated: true });
    renderShell();
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /courses/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /grading queue/i }),
    ).toBeInTheDocument();
  });

  it("shows student navigation without the grading queue", () => {
    useAuthStore.setState({ user: makeUser("student"), isAuthenticated: true });
    renderShell();
    expect(screen.getByRole("link", { name: /my courses/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /grading queue/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the mobile navigation drawer as a dialog", async () => {
    useAuthStore.setState({ user: makeUser("student"), isAuthenticated: true });
    renderShell();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
  });
});
