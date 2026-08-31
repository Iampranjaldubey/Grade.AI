import type { BadgeTone } from "@/components/ui";

/** Percentage a criterion scored, guarding against a zero/absent maximum. */
export function scorePercent(awarded: number, max: number): number {
  if (!max || max <= 0) return 0;
  return (awarded / max) * 100;
}

/**
 * Tone for a criterion's score badge/bar: full marks reads as success, a clear
 * pass as warning, and anything below as danger. Centralised so the professor
 * and student views can never drift apart.
 */
export function criterionTone(awarded: number, max: number): BadgeTone {
  const pct = scorePercent(awarded, max);
  if (pct >= 100) return "success";
  if (pct >= 70) return "warning";
  return "danger";
}

export interface CriterionScore {
  criterion_name: string;
  awarded: number;
  max: number;
  reasoning: string;
}

export interface EvaluationSummary {
  criteria: CriterionScore[];
  percentage: number | undefined;
  overallFeedback: string | undefined;
}

function isCriterionScore(value: unknown): value is CriterionScore {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.criterion_name === "string" && typeof v.awarded === "number";
}

function readCriteria(source: unknown): CriterionScore[] {
  return Array.isArray(source) ? source.filter(isCriterionScore) : [];
}

/**
 * Normalises the two evaluation shapes the API returns.
 *
 * The professor endpoint nests scores under `ai_feedback`, while the student
 * endpoint (`GET /evaluations/submission/{id}`) returns `criteria_scores`,
 * `percentage`, and `overall_feedback` at the top level. Reading only
 * `ai_feedback` meant students never saw their criterion breakdown.
 */
export function readEvaluationSummary(evaluation: unknown): EvaluationSummary {
  if (!evaluation || typeof evaluation !== "object") {
    return { criteria: [], percentage: undefined, overallFeedback: undefined };
  }

  const root = evaluation as Record<string, unknown>;
  const nested =
    root.ai_feedback && typeof root.ai_feedback === "object"
      ? (root.ai_feedback as Record<string, unknown>)
      : undefined;

  const criteria = nested
    ? readCriteria(nested.criteria_scores)
    : readCriteria(root.criteria_scores);

  const percentageSource = nested?.percentage ?? root.percentage;
  const feedbackSource = root.overall_feedback;

  return {
    criteria: criteria.length ? criteria : readCriteria(root.criteria_scores),
    percentage:
      typeof percentageSource === "number" ? percentageSource : undefined,
    overallFeedback:
      typeof feedbackSource === "string" && feedbackSource.trim()
        ? feedbackSource
        : undefined,
  };
}

/** Tailwind background utility for each tone, used by score bars. */
export const toneBarClass: Record<BadgeTone, string> = {
  neutral: "bg-content-muted",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  processing: "bg-processing",
};
