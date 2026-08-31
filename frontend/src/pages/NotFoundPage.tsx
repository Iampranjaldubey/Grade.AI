import { Link } from "react-router-dom";
import { Home, Compass } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { useAuthStore } from "@/store/authStore";
import { homeForRole } from "@/components/layout";

export function NotFoundPage() {
  const { isAuthenticated, user } = useAuthStore();
  const homePath = isAuthenticated ? homeForRole(user?.role) : "/login";

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-md text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-subtle text-brand"
        >
          <Compass className="h-7 w-7" />
        </span>

        <p className="font-serif text-6xl font-semibold text-content">404</p>
        <h1 className="mt-3 font-serif text-2xl font-semibold text-content">
          Page not found
        </h1>
        <p className="mt-2 text-content-muted">
          The page you're looking for doesn't exist or may have been moved.
        </p>

        <Link to={homePath} className={buttonClasses({ className: "mt-8" })}>
          <Home className="h-4 w-4" aria-hidden="true" />
          {isAuthenticated ? "Back to dashboard" : "Go to sign in"}
        </Link>
      </div>
    </main>
  );
}
