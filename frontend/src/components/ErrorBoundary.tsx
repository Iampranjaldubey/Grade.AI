import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors so a single broken screen doesn't blank the whole
 * app. Previously an uncaught error left users with an empty white page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  private handleReload = () => {
    // A full reload is the most reliable recovery from an unknown render error.
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main
        role="alert"
        className="flex min-h-screen items-center justify-center bg-surface-muted px-4 py-12"
      >
        <div className="w-full max-w-md text-center">
          <h1 className="font-serif text-2xl font-semibold text-content">
            Something went wrong
          </h1>
          <p className="mt-2 text-content-muted">
            This page ran into an unexpected problem. Reloading usually fixes it.
          </p>

          {import.meta.env.DEV && (
            <pre className="mt-6 max-h-40 overflow-auto rounded-md border border-edge bg-surface p-3 text-left text-xs text-danger-fg">
              {error.message}
            </pre>
          )}

          <Button className="mt-8" onClick={this.handleReload}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload page
          </Button>
        </div>
      </main>
    );
  }
}
