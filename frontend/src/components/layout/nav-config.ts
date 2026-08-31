import { LayoutDashboard, BookOpen, ClipboardCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/types";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  /** Show the pending-evaluations count badge (professor grading queue). */
  showPendingBadge?: boolean;
}

export const professorNav: NavItem[] = [
  { name: "Dashboard", href: "/professor/dashboard", icon: LayoutDashboard },
  { name: "Courses", href: "/professor/courses", icon: BookOpen },
  {
    name: "Grading Queue",
    href: "/professor/evaluations",
    icon: ClipboardCheck,
    showPendingBadge: true,
  },
];

export const studentNav: NavItem[] = [
  { name: "Dashboard", href: "/student/dashboard", icon: LayoutDashboard },
  { name: "My Courses", href: "/student/courses", icon: BookOpen },
];

export function navForRole(role: UserRole | undefined): NavItem[] {
  return role === "professor" ? professorNav : studentNav;
}

/** Home route for a role — used by the brand lockup link. */
export function homeForRole(role: UserRole | undefined): string {
  return role === "professor" ? "/professor/dashboard" : "/student/dashboard";
}
