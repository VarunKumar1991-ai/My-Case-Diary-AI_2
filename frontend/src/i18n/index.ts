import { en, type Strings } from "./en";

/** "hi" is the named future seam (§7/§8 — eventual Hindi UI, Devanagari-ready fonts already loaded in index.css). */
export type Locale = "en";

const dictionaries: Record<Locale, Strings> = { en };

const DEFAULT_LOCALE: Locale = "en";

/** Centralized string lookup — components call `useStrings()`, never hardcode UI text. */
export function useStrings(locale: Locale = DEFAULT_LOCALE): Strings {
  return dictionaries[locale];
}
