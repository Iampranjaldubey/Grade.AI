import { Link, useLocation } from "react-router-dom";
import { LogOut, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import {
  Badge,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui";
import { navForRole, homeForRole } from "./nav-config";
import type { UserOut } from "@/types";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarNavProps {
  pendingCount: number;
  /** Called after a nav item is chosen — used to close the mobile drawer. */
  onNavigate?: () => void;
}

/** Brand + primary navigation + account menu. Shared by the desktop sidebar
 *  and the mobile drawer so navigation stays consistent across breakpoints. */
export function SidebarNav({ pendingCount, onNavigate }: SidebarNavProps) {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const nav = navForRole(user?.role);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Brand */}
      <div className="flex h-16 flex-shrink-0 items-center border-b border-edge px-5">
        <Link
          to={homeForRole(user?.role)}
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-md"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[3px] bg-brand font-serif text-base font-bold text-white"
          >
            G
          </span>
          <span className="font-serif text-lg font-semibold tracking-tight text-content">
            GradeAI
          </span>
        </Link>
      </div>

      {/* Primary navigation */}
      <nav aria-label="Primary" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav.map((item) => {
          const active = isActivePath(location.pathname, item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium motion-safe:transition-colors",
                active
                  ? "bg-brand-subtle text-brand-fg"
                  : "text-content-soft hover:bg-surface-sunken hover:text-content",
              )}
            >
              <item.icon
                className={cn(
                  "h-[18px] w-[18px] flex-shrink-0",
                  active ? "text-brand" : "text-content-muted group-hover:text-content-soft",
                )}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{item.name}</span>
              {item.showPendingBadge && pendingCount > 0 && (
                <Badge tone="brand" aria-label={`${pendingCount} pending`}>
                  {pendingCount > 99 ? "99+" : pendingCount}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Account menu */}
      <div className="flex-shrink-0 border-t border-edge p-3">
        <UserMenu user={user} onSignOut={() => logout()} />
      </div>
    </div>
  );
}

function UserMenu({
  user,
  onSignOut,
}: {
  user: UserOut | null;
  onSignOut: () => void;
}) {
  const initial = user?.name?.trim()?.charAt(0)?.toUpperCase() || "?";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-safe:transition-colors">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-inverse font-serif text-sm font-semibold text-content-inverse"
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-content">
            {user?.name || "Account"}
          </span>
          <span className="block truncate text-xs capitalize text-content-muted">
            {user?.role}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 flex-shrink-0 text-content-muted" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width] min-w-56">
        <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
        <p className="truncate px-2.5 pb-1.5 text-sm text-content-soft">{user?.email}</p>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={onSignOut}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
