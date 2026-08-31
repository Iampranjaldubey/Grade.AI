import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  to?: string;
}

/** Accessible breadcrumb trail. The last item is marked aria-current="page". */
export function Breadcrumb({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex items-center gap-1.5 text-sm">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {item.to && !last ? (
                <Link
                  to={item.to}
                  className="truncate text-content-muted hover:text-content motion-safe:transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "truncate",
                    last ? "font-medium text-content" : "text-content-muted",
                  )}
                  aria-current={last ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!last && (
                <ChevronRight
                  className="h-3.5 w-3.5 flex-shrink-0 text-content-muted/60"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
