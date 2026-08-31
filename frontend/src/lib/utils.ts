import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose class names and resolve conflicting Tailwind utilities.
 *
 * `clsx` handles conditional/array/object inputs; `twMerge` ensures that when a
 * caller passes an overriding utility (e.g. a `className` prop on a design-system
 * primitive), the later value wins instead of both classes ending up in the DOM.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Human-readable file size. Shared by the uploader and document lists. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** True when a due date is in the past. */
export function isPastDue(dueDate: string): boolean {
  return new Date(dueDate).getTime() < Date.now();
}
