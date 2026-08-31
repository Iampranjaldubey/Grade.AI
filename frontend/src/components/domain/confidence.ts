import type { BadgeTone } from "@/components/ui";

export interface ConfidenceLevel {
  label: "Low" | "Medium" | "High";
  tone: BadgeTone;
}

/**
 * Single source of truth for AI confidence thresholds (previously duplicated
 * across the evaluation review page and the pending evaluations list).
 */
export function confidenceLevel(score: number): ConfidenceLevel {
  if (score < 0.6) return { label: "Low", tone: "danger" };
  if (score < 0.8) return { label: "Medium", tone: "warning" };
  return { label: "High", tone: "success" };
}
