import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import { Field, Input } from "./Field";

describe("cn()", () => {
  it("merges conflicting Tailwind utilities so the last one wins", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("bg-brand", "bg-danger")).toBe("bg-danger");
  });

  it("still supports conditional/array inputs", () => {
    const show = false as boolean;
    expect(cn("a", show && "b", ["c", null])).toBe("a c");
  });
});

describe("Button", () => {
  it("renders children and applies a class override", () => {
    render(<Button className="px-8">Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain("px-8");
  });

  it("is disabled and busy while loading", () => {
    render(<Button isLoading>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });
});

describe("StatusBadge", () => {
  it("maps submission status to a human label", () => {
    render(<StatusBadge kind="submission" value="evaluated" />);
    expect(screen.getByText("Graded")).toBeInTheDocument();
  });

  it("maps approval status to a human label", () => {
    render(<StatusBadge kind="approval" value="overridden" />);
    expect(screen.getByText("Overridden")).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("associates the label and shows an error with role=alert", () => {
    render(
      <Field label="Email" htmlFor="email" error="Required" required>
        <Input id="email" aria-describedby="email-error" invalid />
      </Field>,
    );
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
});
