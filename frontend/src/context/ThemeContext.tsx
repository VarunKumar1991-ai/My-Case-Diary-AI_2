import { createContext, use, useEffect, type ReactNode } from "react";

export type Theme = "dark";

interface ThemeContextValue {
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * §8 mandates a single black/grey/green, terminal-inspired identity — there is
 * no light theme in Phase 1. This provider exists (a) so `index.css`'s `.dark`
 * tokens are active via a class on `<html>` rather than a media query (keeping
 * the look consistent regardless of the officer's OS setting), and (b) as the
 * seam named in §10.1 if a future phase adds a togglable theme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme: Theme = "dark";

  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }, []);

  return <ThemeContext value={{ theme }}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
