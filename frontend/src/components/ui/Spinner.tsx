import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  /** Accessible label; when omitted the spinner is treated as decorative. */
  label?: string;
}

/** Minimal loading spinner used inside buttons and inline loading states. */
export function Spinner({ className, label }: SpinnerProps) {
  return (
    <Loader2
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("h-4 w-4 motion-safe:animate-spin", className)}
    />
  );
}
