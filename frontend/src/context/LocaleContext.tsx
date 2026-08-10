import { createContext, use, useState, type ReactNode } from "react";

import type { Locale } from "@/i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * App-wide current UI language (§7's named "hi" seam, now live). Defaults to
 * "en" everywhere; only the sign-in page currently exposes a switcher, and
 * only `auth`/`about` strings are actually translated (see `i18n/hi.ts`) — so
 * switching to Hindi elsewhere in the app simply falls back to English text
 * for anything not yet translated, rather than breaking.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");
  return <LocaleContext value={{ locale, setLocale }}>{children}</LocaleContext>;
}

export function useLocale(): LocaleContextValue {
  const ctx = use(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}
