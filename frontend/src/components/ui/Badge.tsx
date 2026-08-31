import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "processing";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-content-soft",
  brand: "bg-brand-subtle text-brand-fg",
  success: "bg-success-subtle text-success-fg",
  warning: "bg-warning-subtle text-warning-fg",
  danger: "bg-danger-subtle text-danger-fg",
  info: "bg-info-subtle text-info-fg",
  processing: "bg-processing-subtle text-processing-fg",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** Small pill for statuses, counts, and labels. Color is never the only signal —
 *  pair with an icon or text when it conveys meaning. */
export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
