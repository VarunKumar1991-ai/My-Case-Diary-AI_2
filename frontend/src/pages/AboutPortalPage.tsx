import { InfoIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStrings } from "@/i18n";

/**
 * Static informational page reached from the sidebar ("About this Portal").
 * Explains the platform's purpose and — critically — that it is a pre-submission
 * drafting aid, never an official record system or a CCTNS replacement.
 */
export function AboutPortalPage() {
  const strings = useStrings();
  const about = strings.about;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{about.heading}</h1>
        <p className="text-sm text-muted-foreground">{about.subheading}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{about.whatHeading}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{about.whatBody}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{about.whyHeading}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
            {about.whyPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{about.whoHeading}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{about.whoBody}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{about.aiHeading}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{about.aiBody}</p>
        </CardContent>
      </Card>

      {/* Prominent, non-negotiable disclaimer — this platform must never claim to be CCTNS. */}
      <div className="flex items-start gap-3 rounded-md border border-primary/40 bg-primary/5 p-4">
        <InfoIcon className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">{about.disclaimerHeading}</p>
          <p className="text-sm text-muted-foreground">{about.disclaimerBody}</p>
        </div>
      </div>
    </div>
  );
}
