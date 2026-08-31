import { useId, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { criterionTone, scorePercent, toneBarClass } from "./grading";

interface RubricCriterionRowProps {
  criterionName: string;
  awarded: number;
  max: number;
  /** The AI's justification for this criterion's score. */
  reasoning?: string;
  defaultOpen?: boolean;
  /** Label for the reasoning disclosure, e.g. "AI reasoning". */
  reasoningLabel?: string;
}

/**
 * One rubric criterion with its score, a proportional bar, and the AI's
 * reasoning behind a disclosure.
 *
 * Replaces the criteria accordion that was duplicated between the professor's
 * evaluation review page and the student's result view, so both audiences see
 * an identical, per-criterion breakdown.
 */
export function RubricCriterionRow({
  criterionName,
  awarded,
  max,
  reasoning,
  defaultOpen = false,
  reasoningLabel = "AI reasoning",
}: RubricCriterionRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const tone = criterionTone(awarded, max);
  const pct = scorePercent(awarded, max);
  const hasReasoning = Boolean(reasoning?.trim());

  const header = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h4 className="font-medium text-content">{criterionName}</h4>
          <Badge tone={tone}>{pct.toFixed(0)}%</Badge>
        </div>
        <p className="mt-1 text-sm text-content-muted">
          <span className="font-medium text-content-soft">{awarded}</span> of {max}{" "}
          points
        </p>
        {/* Proportional score bar */}
        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${criterionName} score`}
        >
          <div
            className={cn("h-full rounded-full", toneBarClass[tone])}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>
      {hasReasoning && (
        <ChevronDown
          className={cn(
            "mt-1 h-5 w-5 flex-shrink-0 text-content-muted motion-safe:transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      )}
    </>
  );

  return (
    <div className="overflow-hidden rounded-md border border-edge">
      {hasReasoning ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-start gap-4 bg-surface px-4 py-3.5 text-left hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand motion-safe:transition-colors"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-start gap-4 bg-surface px-4 py-3.5">{header}</div>
      )}

      {hasReasoning && (
        <div
          id={panelId}
          hidden={!open}
          className="border-t border-edge-subtle bg-surface-raised px-4 py-3.5"
        >
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-content-muted">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {reasoningLabel}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-content-soft">
            {reasoning}
          </p>
        </div>
      )}
    </div>
  );
}
