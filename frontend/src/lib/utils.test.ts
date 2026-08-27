import { describe, expect, it } from "vitest";
import { cn, formatDate, formatDateTime } from "./utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("ignores falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("supports conditional object syntax", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });
});

describe("formatDate", () => {
  it("formats an ISO date into a human-readable string", () => {
    const result = formatDate("2025-01-15T00:00:00Z");
    expect(result).toMatch(/2025/);
    expect(result).toMatch(/Jan/);
  });
});

describe("formatDateTime", () => {
  it("includes both date and time components", () => {
    const result = formatDateTime("2025-01-15T13:30:00Z");
    expect(result).toMatch(/2025/);
    // Time portion should be present (contains a colon).
    expect(result).toMatch(/:/);
  });
});
