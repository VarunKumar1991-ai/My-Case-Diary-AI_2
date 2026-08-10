import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale } from "@/context/LocaleContext";
import type { Locale } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * EN / HI switcher — currently only meaningful on the sign-in page and the
 * "About this Portal" popup it opens (the only surfaces with a Hindi
 * translation so far, see `i18n/hi.ts`). Placed wherever a caller needs it;
 * state lives in `LocaleContext` so both instances stay in sync.
 */
export function LanguageSelect({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();

  return (
    <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
      <SelectTrigger size="compact" className={cn("h-8 gap-1 px-2 text-xs", className)} aria-label="Language">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="hi">हिंदी</SelectItem>
      </SelectContent>
    </Select>
  );
}
