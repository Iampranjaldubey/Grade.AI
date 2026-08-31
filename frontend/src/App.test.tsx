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

// Routes are code-split, so screens resolve asynchronously via Suspense.
describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("redirects unauthenticated users from the root to the login page", async () => {
    renderApp("/");
    expect(
      await screen.findByRole("heading", { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });

  it("renders the login page with email and password fields", async () => {
    renderApp("/login");
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    // Exact match avoids colliding with the "Show password" toggle button.
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("renders the registration page", async () => {
    renderApp("/register");
    // The register page exposes a name field that login does not.
    expect(await screen.findByLabelText(/full name/i)).toBeInTheDocument();
  });

  it("renders a not-found page for unknown routes", async () => {
    renderApp("/this-route-does-not-exist");
    // The descriptive title is the heading; "404" is decorative text beside it.
    expect(
      await screen.findByRole("heading", { name: /page not found/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
  });
});
