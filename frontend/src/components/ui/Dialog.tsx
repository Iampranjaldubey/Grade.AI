import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: keyof typeof sizeClasses;
  /** Hide the default close button (e.g. for required decisions). */
  hideClose?: boolean;
}

/**
 * Accessible modal content. Radix provides the focus trap, Escape-to-close,
 * `aria-modal`, scroll lock, and focus restoration that the previous hand-built
 * modals lacked. On small screens it renders as a bottom sheet.
 */
export function DialogContent({
  className,
  children,
  size = "md",
  hideClose = false,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[1px] motion-safe:animate-[gradeai-fade-in_150ms_ease]"
      />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex max-h-[92vh] w-full flex-col overflow-hidden border border-edge bg-surface shadow-overlay focus:outline-none",
          // Mobile: bottom sheet. sm+: centered dialog.
          "inset-x-0 bottom-0 rounded-t-xl motion-safe:animate-[gradeai-pop-in_180ms_ease]",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg",
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-md p-1 text-content-muted hover:bg-surface-sunken hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-safe:transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-edge-subtle px-6 py-4",
        className,
      )}
      {...props}
    />
  );
}

export function DialogBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("overflow-y-auto px-6 py-5", className)} {...props} />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 border-t border-edge-subtle px-6 py-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("pr-8 font-serif text-xl font-semibold text-content", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-content-muted", className)}
      {...props}
    />
  );
}
