import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-sans font-semibold whitespace-nowrap select-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface " +
  "disabled:pointer-events-none disabled:opacity-60 motion-safe:transition-colors";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "bg-surface-sunken text-content hover:bg-edge-subtle",
  outline: "border border-edge-strong bg-surface text-content hover:bg-surface-raised",
  ghost: "text-content-soft hover:bg-surface-sunken hover:text-content",
  danger: "bg-danger text-white hover:bg-danger-fg",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-[15px]",
};

/**
 * Returns the button class recipe. Use this when an element that is
 * semantically a link (e.g. react-router `<Link>`) should look like a button,
 * so link-buttons and real buttons stay visually identical.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}) {
  return cn(
    base,
    variantClasses[variant],
    sizeClasses[size],
    block && "w-full",
    className,
  );
}
