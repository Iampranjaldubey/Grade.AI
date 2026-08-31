import type { SubmissionOut } from "@/types";

const POLL_MS = 4000;

/**
 * `refetchInterval` predicate for submission lists: keeps polling while the AI
 * is still grading anything, then stops.
 *
 * Replaces the fixed `setTimeout(..., 3000)` refresh that previously ran after
 * triggering an evaluation, which guessed at how long grading would take.
 */
export function pollWhileEvaluating(
  submissions: Pick<SubmissionOut, "status">[] | undefined,
): number | false {
  if (!submissions?.length) return false;
  return submissions.some((s) => s.status === "evaluating") ? POLL_MS : false;
}
