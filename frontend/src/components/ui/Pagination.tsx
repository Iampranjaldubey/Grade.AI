import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

interface PaginationProps {
  /** 1-indexed current page. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Range summary + prev/next controls for paginated lists and tables. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: PaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-between gap-3 sm:flex-row",
        className,
      )}
    >
      <p className="text-sm text-content-muted" aria-live="polite">
        Showing <span className="font-medium text-content">{from}</span>–
        <span className="font-medium text-content">{to}</span> of{" "}
        <span className="font-medium text-content">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="px-1 text-sm text-content-muted">
          Page {page} of {lastPage}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= lastPage}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
