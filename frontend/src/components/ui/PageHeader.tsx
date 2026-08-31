import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned actions (buttons, menus). */
  actions?: React.ReactNode;
  className?: string;
}

/** Standard page title block: serif heading + optional description + actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-content sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-content-muted">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
