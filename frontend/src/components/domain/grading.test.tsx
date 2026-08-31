import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { criterionTone, scorePercent } from "./grading";
import { confidenceLevel } from "./confidence";
import { GradeDisplay } from "./GradeDisplay";
import { RubricCriterionRow } from "./RubricCriterionRow";
import { AIReasoningPanel } from "./AIReasoningPanel";
import { SubmissionViewer } from "./SubmissionViewer";

describe("scoring helpers", () => {
  it("computes a percentage and guards a zero maximum", () => {
    expect(scorePercent(8, 10)).toBe(80);
    expect(scorePercent(5, 0)).toBe(0);
  });

  it("maps criterion scores to tones", () => {
    expect(criterionTone(10, 10)).toBe("success");
    expect(criterionTone(8, 10)).toBe("warning");
    expect(criterionTone(4, 10)).toBe("danger");
  });

  it("maps AI confidence to levels", () => {
    expect(confidenceLevel(0.4).label).toBe("Low");
    expect(confidenceLevel(0.7).label).toBe("Medium");
    expect(confidenceLevel(0.95).label).toBe("High");
  });
});

describe("GradeDisplay", () => {
  it("renders the score, total and percentage", () => {
    render(
      <GradeDisplay label="AI recommendation" score="42" outOf="50" percentage={84} />,
    );
    expect(screen.getByText("AI recommendation")).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
    expect(screen.getByText("/ 50")).toBeInTheDocument();
    expect(screen.getByText("84.0%")).toBeInTheDocument();
  });

  it("falls back to a dash when there is no score", () => {
    render(<GradeDisplay label="Final grade" score={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("RubricCriterionRow", () => {
  it("hides AI reasoning until the row is expanded", () => {
    render(
      <RubricCriterionRow
        criterionName="Code quality"
        awarded={7}
        max={10}
        reasoning="Naming is clear but error handling is thin."
      />,
    );

    const toggle = screen.getByRole("button", { name: /code quality/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(/error handling is thin/i),
    ).toBeInTheDocument();
  });

  it("renders without a disclosure when there is no reasoning", () => {
    render(<RubricCriterionRow criterionName="Structure" awarded={5} max={5} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Structure")).toBeInTheDocument();
  });
});

describe("AIReasoningPanel", () => {
  it("renders nothing when there is no qualitative feedback", () => {
    const { container } = render(
      <AIReasoningPanel strengths={[]} weaknesses={null} missingTopics={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each group that has content", () => {
    render(
      <AIReasoningPanel
        strengths={["Clear thesis"]}
        weaknesses={["Weak conclusion"]}
        missingTopics={["Mitosis"]}
      />,
    );
    expect(screen.getByText("Clear thesis")).toBeInTheDocument();
    expect(screen.getByText("Weak conclusion")).toBeInTheDocument();
    expect(screen.getByText("Mitosis")).toBeInTheDocument();
  });
});

describe("SubmissionViewer", () => {
  it("shows the student, file and a link to open the document", () => {
    render(
      <SubmissionViewer
        studentName="Ada Lovelace"
        studentEmail="ada@example.com"
        fileName="essay.pdf"
        fileUrl="https://example.com/essay.pdf"
        submittedAt="2026-03-01T10:00:00Z"
        status="evaluated"
      />,
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("essay.pdf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open document/i })).toHaveAttribute(
      "href",
      "https://example.com/essay.pdf",
    );
  });

  it("explains the gap when no document is available", () => {
    render(
      <SubmissionViewer
        studentName="Ada Lovelace"
        unavailableNote="The submitted document isn't available yet."
      />,
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(
      screen.getByText(/document isn't available yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
