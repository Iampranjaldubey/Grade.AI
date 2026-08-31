import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import type { ButtonVariant } from "./button-variants";
import { Spinner } from "./Spinner";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual tone of the confirm button. */
  tone?: Extract<ButtonVariant, "primary" | "danger">;
  isLoading?: boolean;
  onConfirm: () => void;
}

/**
 * Confirmation dialog for consequential actions (deletes, finalizing a grade).
 * Replaces native window.confirm(). Built on Radix AlertDialog so it traps
 * focus, closes on Escape, and exposes the correct alertdialog semantics.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[1px] motion-safe:animate-[gradeai-fade-in_150ms_ease]" />
        <AlertDialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-lg border border-edge bg-surface p-6 shadow-overlay focus:outline-none",
            "motion-safe:animate-[gradeai-pop-in_180ms_ease]",
          )}
        >
          <div className="flex gap-4">
            {tone === "danger" && (
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-danger-subtle text-danger-fg">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <AlertDialogPrimitive.Title className="font-serif text-lg font-semibold text-content">
                {title}
              </AlertDialogPrimitive.Title>
              {description && (
                <AlertDialogPrimitive.Description className="mt-1.5 text-sm text-content-muted">
                  {description}
                </AlertDialogPrimitive.Description>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="ghost" disabled={isLoading}>
                {cancelLabel}
              </Button>
            </AlertDialogPrimitive.Cancel>
            {/* Not using AlertDialogAction so we can keep the dialog open while
                the async action runs and show a loading state. */}
            <Button variant={tone} onClick={onConfirm} disabled={isLoading}>
              {isLoading && <Spinner />}
              {confirmLabel}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
