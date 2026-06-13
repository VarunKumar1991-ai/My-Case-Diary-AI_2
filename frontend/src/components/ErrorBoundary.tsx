import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { en } from "@/i18n/en";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort render-error catch (Phase 7 hardening — "error boundaries").
 * Class component because that lifecycle has no Hook equivalent
 * (`getDerivedStateFromError`/`componentDidCatch`). Mounted once around the
 * whole app in `main.tsx`, so it can also catch failures inside the context
 * providers themselves — which is why it reads strings straight from `en`
 * rather than `useStrings()`: depending on app context for the fallback that
 * runs *because* app context may have broken would be circular.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const strings = en.errorBoundary;
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 text-center" role="alert">
        <p className="font-mono text-sm text-destructive" aria-hidden="true">
          ⚠
        </p>
        <h1 className="text-2xl font-semibold text-foreground">{strings.heading}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{strings.body}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.location.assign("/home")}>
            {strings.backToHome}
          </Button>
          <Button onClick={() => window.location.reload()}>{strings.reload}</Button>
        </div>
      </div>
    );
  }
}
