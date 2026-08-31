import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RubricBuilder } from "./RubricBuilder";
import type { RubricOut } from "@/types";

function makeRubric(
  name: string,
  weight: string,
  maxPoints = "10",
): RubricOut {
  return {
    id: `r-${name}`,
    assignment_id: "a1",
    criteria_name: name,
    description: null,
    max_points: maxPoints,
    weight,
    evaluation_hints: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function renderBuilder(rubrics: RubricOut[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RubricBuilder assignmentId="a1" rubrics={rubrics} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RubricBuilder", () => {
  it("prompts to create a rubric when none exists", () => {
    renderBuilder([]);
    expect(screen.getByText(/no rubric yet/i)).toBeInTheDocument();
  });

  it("lists saved criteria with their weights and points", () => {
    renderBuilder([makeRubric("Correctness", "60", "30"), makeRubric("Style", "40")]);
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("30 pts")).toBeInTheDocument();
  });

  it("reports a complete weight total as valid", () => {
    renderBuilder([makeRubric("Correctness", "60"), makeRubric("Style", "40")]);
    expect(screen.getByRole("status")).toHaveTextContent("100% of 100%");
  });

  it("flags an incomplete weight total", () => {
    renderBuilder([makeRubric("Correctness", "60"), makeRubric("Style", "25")]);
    expect(screen.getByRole("status")).toHaveTextContent("85% of 100%");
  });

  it("enters edit mode and can remove a criterion from the draft", () => {
    renderBuilder([makeRubric("Correctness", "60"), makeRubric("Style", "40")]);

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    // Draft now editable: each row exposes a remove control.
    fireEvent.click(screen.getByRole("button", { name: /remove style/i }));

    expect(screen.queryByText("Style")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("60% of 100%");
  });
});
