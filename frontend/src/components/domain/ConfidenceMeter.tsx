import { cn } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui";
import { confidenceLevel } from "./confidence";

const barColor: Record<BadgeTone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
  neutral: "bg-content-muted",
  brand: "bg-brand",
  info: "bg-info",
  processing: "bg-processing",
};

interface ConfidenceMeterProps {
  /** Confidence in the 0–1 range. */
  score: number;
  variant?: "badge" | "bar";
  className?: string;
}

/** Displays the AI's self-reported confidence as a labeled badge or a bar. */
export function ConfidenceMeter({
  score,
  variant = "badge",
  className,
}: ConfidenceMeterProps) {
  const level = confidenceLevel(score);
  const pct = Math.round(score * 100);

  if (variant === "badge") {
    return (
      <Badge tone={level.tone} className={className}>
        {level.label} · {pct}%
      </Badge>
    );
  }

  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-content-soft">AI confidence</span>
        <span className="text-content-muted">
          {level.label} · {pct}%
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="AI confidence"
      >
        <div
          className={cn("h-full rounded-full motion-safe:transition-all", barColor[level.tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
