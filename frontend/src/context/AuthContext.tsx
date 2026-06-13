import { createContext, use, useEffect, useState, type ReactNode } from "react";

import { api } from "@/apis/client";

export type Role = "OFFICER" | "ADMIN";
export type AccountStatus = "ACTIVE" | "BLOCKED";

export interface CurrentUser {
  id: string;
  role: Role;
  accountStatus: AccountStatus;
  name: string;
  designation: string | null;
  email: string | null;
  mobile: string | null;
}

interface AuthContextValue {
  /** `undefined` while the initial `/me` check is in flight, `null` when signed out. */
  user: CurrentUser | null | undefined;
  isLoading: boolean;
  /** Re-runs `GET /me` — call after sign-in/out or a profile change so state stays server-derived. */
  refresh: () => Promise<CurrentUser | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * §5: "Frontend derives auth state *exclusively* from `GET /me` — never by
 * decoding the JWT client-side." This context is the single source of truth
 * for `user`; nothing else may read or cache the access token.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  async function refresh(): Promise<CurrentUser | null> {
    try {
      const { user: current } = await api.get<{ user: CurrentUser }>("/me");
      setUser(current);
      return current;
    } catch {
      // Any failure (401 "not signed in", or the API being unreachable) means
      // there is no usable session — fall through to the signed-out experience
      // rather than leaving the app stuck on its initial loading screen.
      setUser(null);
      return null;
    }
  }

  async function signOut(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
    }
  }

  useEffect(() => {
    // Synchronizing with an external system (the backend session via `GET /me`)
    // on mount, per §5 — there is no event to subscribe to instead, so a
    // direct setState here is the correct, terminal use of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  return (
    <AuthContext value={{ user, isLoading: user === undefined, refresh, signOut }}>
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
