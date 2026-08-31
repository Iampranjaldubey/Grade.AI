import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Primary call-to-action(s). */
  action?: React.ReactNode;
  className?: string;
}

/** Consistent empty state used across lists, tables, and tabs. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-edge-strong bg-surface-raised px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-content-muted">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      <h3 className="font-serif text-lg font-semibold text-content">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-content-muted">{description}</p>
      )}
      {action && <div className="mt-6 flex items-center gap-3">{action}</div>}
    </div>
  );
}
