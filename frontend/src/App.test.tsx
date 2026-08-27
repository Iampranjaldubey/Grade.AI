import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

function renderApp(initialRoute = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("redirects unauthenticated users from the root to the login page", () => {
    renderApp("/");
    expect(
      screen.getByRole("heading", { name: /gradeai/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/sign in to your account/i)).toBeInTheDocument();
  });

  it("renders the login page with email and password fields", () => {
    renderApp("/login");
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("renders the registration page", () => {
    renderApp("/register");
    // The register page exposes a name field that login does not.
    expect(screen.getByLabelText(/full name|name/i)).toBeInTheDocument();
  });

  it("renders a not-found page for unknown routes", () => {
    renderApp("/this-route-does-not-exist");
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
  });
});
