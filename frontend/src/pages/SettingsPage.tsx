import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/AuthContext";
import { useStrings } from "@/i18n";

/**
 * Informational by design: theme is fixed to dark (`ThemeContext.tsx`) and the
 * `users` table carries no preference columns (§10 schema), so there is
 * nothing to toggle yet — these sections explain *why*, not configure *what*.
 */
export function SettingsPage() {
  const strings = useStrings();
  const { signOut } = useAuth();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{strings.settings.heading}</h1>
        <p className="text-sm text-muted-foreground">{strings.settings.subheading}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{strings.settings.appearanceHeading}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{strings.settings.appearanceBody}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{strings.settings.languageHeading}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{strings.settings.languageBody}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{strings.settings.dataHeading}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{strings.settings.dataBody}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{strings.settings.sessionHeading}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{strings.settings.sessionBody}</p>
          <Separator />
          <div>
            <Button variant="destructive" onClick={() => void signOut()}>
              {strings.settings.signOut}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
