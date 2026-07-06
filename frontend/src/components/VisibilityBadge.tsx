import { type DiaryVisibility } from "@/apis/caseDiaries";
import { useStrings } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * The single, portal-wide Public/Private indicator. Rendered identically
 * everywhere (View Diaries, the editor header, …) as a rounded pill: a bright
 * green pill for PUBLIC and a red pill for PRIVATE. Colours are fixed (not
 * theme tokens) so the badge looks the same in light and dark mode.
 */
export function VisibilityBadge({
  visibility,
  className,
}: {
  visibility: DiaryVisibility;
  className?: string;
}) {
  const strings = useStrings();
  const isPublic = visibility === "PUBLIC";
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        isPublic ? "bg-green-400 text-green-950" : "bg-red-400 text-red-950",
        className,
      )}
    >
      {isPublic ? strings.diary.public : strings.diary.private}
    </span>
  );
}
