import { useNavigate } from "react-router-dom";

import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useStrings } from "@/i18n";

/**
 * Forced first-login password change. Officers land here whenever their account
 * is still on the shared default password (after the initial rollout or an admin
 * reset) — `RequireAuth` redirects here and the backend's `authGuard` blocks
 * every other route until the flag clears, so this can't be skipped by URL.
 */
export function ChangePasswordPage() {
  const strings = useStrings();
  const navigate = useNavigate();
  const { refresh, signOut } = useAuth();

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-mono text-primary">{strings.auth.setNewPasswordHeading}</CardTitle>
          <CardDescription>{strings.auth.setNewPasswordBody}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ChangePasswordForm
            onChanged={async () => {
              // Re-read `GET /me` so the cleared flag propagates, then continue.
              await refresh();
              navigate("/home", { replace: true });
            }}
          />
          <Button variant="ghost" className="self-start px-0 text-muted-foreground" onClick={() => void signOut()}>
            {strings.settings.signOut}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
