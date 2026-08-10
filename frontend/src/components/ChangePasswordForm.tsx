import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { authApi } from "@/apis/auth";
import { ApiError } from "@/apis/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useStrings } from "@/i18n";

/**
 * The one change-password form — used both from Settings (voluntary) and from
 * the forced first-login screen. `onChanged` lets the forced screen re-run
 * `GET /me` so the `mustChangePassword` flag clears and the app unblocks.
 */
export function ChangePasswordForm({ onChanged }: { onChanged?: () => void | Promise<void> }) {
  const strings = useStrings();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(strings.auth.passwordTooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(strings.auth.passwordsDoNotMatch);
      return;
    }

    setSaving(true);
    authApi
      .changePassword({ currentPassword, newPassword })
      .then(async () => {
        toast.success(strings.auth.passwordChanged);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        await onChanged?.();
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong))
      .finally(() => setSaving(false));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current-password">{strings.auth.currentPassword}</Label>
        <PasswordInput
          id="current-password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">{strings.auth.newPassword}</Label>
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{strings.auth.passwordRule}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-password">{strings.auth.confirmNewPassword}</Label>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        className="self-start"
        disabled={saving || !currentPassword || !newPassword || !confirmPassword}
      >
        {saving ? strings.common.saving : strings.auth.changePassword}
      </Button>
    </form>
  );
}
