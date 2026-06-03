import { describe, expect, it } from "vitest";
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

describe("App", () => {
  it("renders the home page headline", () => {
    renderApp("/");
    expect(screen.getByRole("heading", { name: /grade student work with ai/i })).toBeInTheDocument();
  });

  it("renders the sign-in page", () => {
    renderApp("/login");
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });
});
