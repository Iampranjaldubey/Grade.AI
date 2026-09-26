import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "./Field";
import { Skeleton } from "./Skeleton";
import { Pagination } from "./Pagination";

type SortDir = "asc" | "desc";
type Align = "left" | "right" | "center";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number;
  align?: Align;
  /** Hide this column in the mobile card layout. */
  hideOnMobile?: boolean;
  headerClassName?: string;
  cellClassName?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  isLoading?: boolean;
  loadingRows?: number;
  /** Rendered when there are no rows (after filtering). */
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** Return the searchable text for a row to enable the search box. */
  searchable?: (row: T) => string;
  searchPlaceholder?: string;
  /** Extra controls (filters) shown next to the search box. */
  toolbar?: React.ReactNode;
  pageSize?: number;
  initialSort?: { columnId: string; dir: SortDir };
  /** Accessible table caption. */
  caption?: string;
}

const alignClass: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  data,
  columns,
  getRowId,
  isLoading = false,
  loadingRows = 6,
  empty,
  onRowClick,
  searchable,
  searchPlaceholder = "Search…",
  toolbar,
  pageSize = 10,
  initialSort,
  caption,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ columnId: string; dir: SortDir } | null>(
    initialSort ?? null,
  );
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return data;
    const q = query.trim().toLowerCase();
    return data.filter((row) => searchable(row).toLowerCase().includes(q));
  }, [data, searchable, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.columnId);
    if (!col?.sortValue) return filtered;
    const getVal = col.sortValue;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sort, columns]);

  // Reset to the first page whenever the result set changes shape.
  useEffect(() => {
    setPage(1);
  }, [query, sort]);

  const total = sorted.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, lastPage);
  const pageRows = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const toggleSort = (columnId: string) => {
    setSort((prev) => {
      if (prev?.columnId !== columnId) return { columnId, dir: "asc" };
      if (prev.dir === "asc") return { columnId, dir: "desc" };
      return null;
    });
  };

  const mobileColumns = columns.filter((c) => !c.hideOnMobile);

  return (
    <div className="space-y-4">
      {(searchable || toolbar) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {searchable ? (
            <div className="relative w-full sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-9"
              />
            </div>
          ) : (
            <div />
          )}
          {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
        </div>
      )}

      {isLoading ? (
        <div className="overflow-hidden rounded-lg border border-edge">
          <div className="divide-y divide-edge-subtle">
            {Array.from({ length: loadingRows }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-4">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="ml-auto h-8 w-20" />
              </div>
            ))}
          </div>
        </div>
      ) : total === 0 ? (
        empty ?? null
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-edge bg-surface md:block">
            <table className="min-w-full divide-y divide-edge">
              {caption && <caption className="sr-only">{caption}</caption>}
              <thead className="bg-surface-raised">
                <tr>
                  {columns.map((col) => {
                    const active = sort?.columnId === col.id;
                    return (
                      <th
                        key={col.id}
                        scope="col"
                        aria-sort={
                          col.sortValue
                            ? active
                              ? sort?.dir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                            : undefined
                        }
                        className={cn(
                          "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-content-muted",
                          alignClass[col.align ?? "left"],
                          col.headerClassName,
                        )}
                      >
                        {col.sortValue ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(col.id)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-safe:transition-colors",
                              col.align === "right" && "flex-row-reverse",
                            )}
                          >
                            {col.header}
                            {active ? (
                              sort?.dir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                              )
                            ) : (
                              <ChevronsUpDown
                                className="h-3.5 w-3.5 opacity-50"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        ) : (
                          col.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-subtle">
                {pageRows.map((row) => (
                  <tr
                    key={getRowId(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "bg-surface",
                      onRowClick &&
                        "cursor-pointer hover:bg-surface-raised motion-safe:transition-colors",
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={cn(
                          "px-4 py-3.5 text-sm text-content-soft align-middle",
                          alignClass[col.align ?? "left"],
                          col.cellClassName,
                        )}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {pageRows.map((row) => {
              const content = (
                <dl className="space-y-2">
                  {mobileColumns.map((col) => (
                    <div
                      key={col.id}
                      className="flex items-start justify-between gap-3"
                    >
                      <dt className="text-xs font-medium uppercase tracking-wide text-content-muted">
                        {col.header}
                      </dt>
                      <dd className="min-w-0 text-right text-sm text-content-soft">
                        {col.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              );
              return (
                <li key={getRowId(row)}>
                  {onRowClick ? (
                    <button
                      type="button"
                      onClick={() => onRowClick(row)}
                      className="w-full rounded-lg border border-edge bg-surface p-4 text-left shadow-card hover:border-edge-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-safe:transition-colors"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="rounded-lg border border-edge bg-surface p-4 shadow-card">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {total > pageSize && (
            <Pagination
              page={currentPage}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
