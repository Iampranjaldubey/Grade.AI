import { cn } from "@/lib/utils";

type GradeTone = "draft" | "final";

interface GradeDisplayProps {
  /** Eyebrow label, e.g. "AI recommendation" or "Final grade". */
  label: string;
  score: string | number | null | undefined;
  outOf?: string | number;
  percentage?: number;
  /**
   * `draft` = an AI suggestion that nobody has accepted yet (neutral paper).
   * `final` = a decision the professor has made (approved, sage-tinted).
   */
  tone?: GradeTone;
  /** Supporting line under the score, e.g. a confidence meter or timestamp. */
  caption?: React.ReactNode;
  className?: string;
}

const toneClasses: Record<GradeTone, string> = {
  draft: "border-edge-strong bg-surface-raised",
  final: "border-success/30 bg-success-subtle",
};

const labelClasses: Record<GradeTone, string> = {
  draft: "text-content-muted",
  final: "text-success-fg",
};

/**
 * Prominent score readout. The `tone` makes the single most important
 * distinction in the product explicit: an AI *recommendation* looks like an
 * unconfirmed draft, whereas a professor's *final* grade is visually settled.
 */
export function GradeDisplay({
  label,
  score,
  outOf,
  percentage,
  tone = "draft",
  caption,
  className,
}: GradeDisplayProps) {
  return (
    <div
      className={cn(
        "rounded-lg border px-5 py-6 text-center",
        toneClasses[tone],
        className,
      )}
    >
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.14em]",
          labelClasses[tone],
        )}
      >
        {label}
      </p>

      <p className="mt-2 font-serif text-5xl font-semibold leading-none text-content">
        {score ?? "—"}
        {outOf !== undefined && (
          <span className="ml-1 align-baseline font-sans text-lg font-normal text-content-muted">
            / {outOf}
          </span>
        )}
      </p>

      {percentage !== undefined && (
        <p className="mt-2 text-sm font-medium text-content-soft">
          {percentage.toFixed(1)}%
        </p>
      )}

      {caption && <div className="mt-4 text-left">{caption}</div>}
    </div>
  );
}
