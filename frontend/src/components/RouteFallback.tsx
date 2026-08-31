import { Skeleton } from "@/components/ui";

/**
 * Shown while a lazily-loaded route chunk downloads. Mirrors the page shell's
 * rhythm so the layout doesn't jump once the real screen renders.
 */
export function RouteFallback() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      role="status"
      aria-label="Loading page"
    >
      <Skeleton className="h-9 w-1/3" />
      <Skeleton className="mt-4 h-4 w-1/2" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="mt-8 h-64 w-full" />
    </div>
  );
}
