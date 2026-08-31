import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: TooltipPrimitive.TooltipContentProps["side"];
  className?: string;
}

/**
 * Self-contained tooltip. Wraps its own Provider so callers don't need to add
 * one, while a shared TooltipProvider higher in the tree still works (Radix
 * allows nesting). Content is hidden from the a11y tree when the trigger
 * already has an accessible name; use for supplementary hints only.
 */
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className={cn(
              "z-50 max-w-xs rounded-md bg-surface-inverse px-2.5 py-1.5 text-xs font-medium text-content-inverse shadow-overlay",
              "motion-safe:animate-[gradeai-fade-in_120ms_ease]",
              className,
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-surface-inverse" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
