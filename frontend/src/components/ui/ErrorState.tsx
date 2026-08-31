import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/** Consistent error state for failed data fetches and unexpected failures. */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this content. Please try again.",
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-danger-subtle bg-danger-subtle/50 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-subtle text-danger-fg">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="font-serif text-lg font-semibold text-content">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-content-muted">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-6" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
