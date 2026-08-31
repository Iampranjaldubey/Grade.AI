import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, type BadgeTone } from "@/components/ui";

const iconTone: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-content-soft",
  brand: "bg-brand-subtle text-brand",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  info: "bg-info-subtle text-info",
  processing: "bg-processing-subtle text-processing",
};

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: BadgeTone;
  /** When provided, the whole card links here. */
  to?: string;
}

/**
 * Compact metric tile. Uses one restrained tone per card (default neutral)
 * rather than the previous rainbow of stat colors, so the numbers — not the
 * decoration — carry the emphasis.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
  to,
}: StatCardProps) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-content-muted">{label}</p>
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md",
            iconTone[tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 font-serif text-3xl font-semibold text-content">{value}</p>
      {hint && <p className="mt-1 text-xs text-content-muted">{hint}</p>}
    </>
  );

  if (to) {
    return (
      <Card interactive className="block p-5">
        <Link to={to} className="block rounded-md focus-visible:outline-none">
          {inner}
        </Link>
      </Card>
    );
  }
  return <Card className="p-5">{inner}</Card>;
}
