import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth, type Role } from "@/context/AuthContext";
import { useStrings } from "@/i18n";

function FullScreenLoader() {
  const strings = useStrings();
  return (
    <div className="flex min-h-svh items-center justify-center bg-background text-muted-foreground">
      <p className="font-mono text-sm">{strings.common.loading}</p>
    </div>
  );
}

/**
 * §5: redirect/guard decisions are driven exclusively by `GET /me` (via
 * `AuthContext`) — never by inspecting a token. `accountStatus === "BLOCKED"`
 * is treated as signed-out here too: `authGuard` rejects every subsequent
 * request from a blocked account anyway (D12), so there is nothing useful to
 * show inside the shell.
 */
export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenLoader />;
  if (!user || user.accountStatus === "BLOCKED") {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/** Keeps already-authenticated officers off the sign-in/sign-up screens. */
export function RequireGuest() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <FullScreenLoader />;
  if (user && user.accountStatus === "ACTIVE") {
    return <Navigate to="/home" replace />;
  }
  return <Outlet />;
}

/**
 * Route-level RBAC — enforcement layer #1 of the defense-in-depth chain
 * (architecture.md §5: route/middleware → service → DAL). The backend
 * re-checks independently; this guard only prevents an unauthorized officer
 * from ever rendering admin UI.
 */
export function RequireRole({ role }: { role: Role }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <FullScreenLoader />;
  if (!user || user.accountStatus !== "ACTIVE") {
    return <Navigate to="/signin" replace />;
  }
  if (user.role !== role) {
    return <Navigate to="/home" replace />;
  }
  return <Outlet />;
}
