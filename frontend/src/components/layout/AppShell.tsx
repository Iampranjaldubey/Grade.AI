import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { evaluationsApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Breadcrumb, type Crumb } from "@/components/ui";
import { SidebarNav } from "./SidebarNav";

interface AppShellProps {
  children: React.ReactNode;
  /** Breadcrumb trail shown in the topbar. */
  breadcrumbs?: Crumb[];
}

/**
 * Persistent application frame: a fixed sidebar on desktop, a focus-trapped
 * drawer on mobile, and a sticky topbar with breadcrumbs. Replaces the old
 * navbar-only ProfessorLayout / StudentLayout (which had no mobile navigation).
 * Navigation is derived from the authenticated user's role.
 */
export function AppShell({ children, breadcrumbs = [] }: AppShellProps) {
  const { user } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isProfessor = user?.role === "professor";

  // Pending grading count powers the sidebar badge (professors only).
  const { data: pending = [] } = useQuery({
    queryKey: ["evaluations", "pending"],
    queryFn: () => evaluationsApi.getPending(),
    refetchInterval: 30_000,
    enabled: isProfessor,
  });
  const pendingCount = pending.length;

  return (
    <div className="min-h-screen bg-surface-muted">
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-edge lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-[260px] lg:flex-col">
        <SidebarNav pendingCount={pendingCount} />
      </aside>

      {/* Mobile drawer */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[1px] motion-safe:animate-[gradeai-fade-in_150ms_ease] lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] border-r border-edge shadow-overlay focus:outline-none motion-safe:animate-[gradeai-fade-in_150ms_ease] lg:hidden">
            <DialogPrimitive.Title className="sr-only">
              Navigation
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="absolute right-3 top-4 z-10 rounded-md p-1 text-content-muted hover:bg-surface-sunken hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
            <SidebarNav
              pendingCount={pendingCount}
              onNavigate={() => setMobileOpen(false)}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Content column */}
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-edge bg-surface/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-content-soft hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          {breadcrumbs.length > 0 ? (
            <Breadcrumb items={breadcrumbs} />
          ) : (
            <span className="font-serif text-base font-semibold text-content lg:hidden">
              GradeAI
            </span>
          )}
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
