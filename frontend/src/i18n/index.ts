import { useLocale } from "@/context/LocaleContext";

import { en, type Strings } from "./en";
import { hi } from "./hi";

export type Locale = "en" | "hi";

const dictionaries: Record<Locale, Strings> = { en, hi };

/** Centralized string lookup — components call `useStrings()`, never hardcode UI text. */
export function useStrings(): Strings {
  const { locale } = useLocale();
  return dictionaries[locale];
}
