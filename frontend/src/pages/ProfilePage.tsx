import { useEffect, useState } from "react";

import { ApiError } from "@/apis/client";
import { lookupsApi, type LookupOption } from "@/apis/lookups";
import { profileApi } from "@/apis/profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { useStrings } from "@/i18n";
import { toast } from "sonner";

/**
 * §10 D8: only `name`/`designation` are self-editable here — `pno` (id), `role`,
 * `accountStatus`, `email`, and `mobile` are governance- or OTP-verification-gated
 * and render read-only with an explanatory hint (see `profile.contactImmutableHint`).
 */
export function ProfilePage() {
  const strings = useStrings();
  const { user, refresh } = useAuth();

  const [designations, setDesignations] = useState<LookupOption[]>([]);
  const [name, setName] = useState(user?.name ?? "");
  const [designation, setDesignation] = useState(user?.designation ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    lookupsApi
      .listDesignations()
      .then(({ designations: options }) => {
        if (!cancelled) setDesignations(options);
      })
      .catch(() => {
        // Designation list is for the picker only — the current value still displays if this fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  const currentDesignation = user.designation ?? "";
  const dirty = name.trim() !== user.name || designation !== currentDesignation;

  const handleSave = () => {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    const input: { name?: string; designation?: string } = {};
    if (name.trim() !== user.name) input.name = name.trim();
    if (designation !== currentDesignation) input.designation = designation;

    profileApi
      .update(input)
      .then(() => refresh())
      .then(() => toast.success(strings.profile.updated))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{strings.profile.heading}</h1>
        <p className="text-sm text-muted-foreground">{strings.profile.subheading}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{strings.auth.pno}</CardTitle>
          <CardDescription>{strings.profile.contactImmutableHint}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{strings.auth.pno}</Label>
            <p className="font-mono text-sm text-foreground">{user.id}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{strings.profile.role}</Label>
            <p className="font-mono text-sm text-foreground">{strings.roles[user.role]}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{strings.auth.designation}</Label>
            <p className="font-mono text-sm text-foreground">{user.designation ?? strings.profile.notProvided}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{strings.auth.email}</Label>
            <p className="font-mono text-sm text-foreground">{user.email ?? strings.profile.notProvided}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{strings.auth.mobile}</Label>
            <p className="font-mono text-sm text-foreground">{user.mobile ?? strings.profile.notProvided}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{strings.common.edit}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-name">{strings.auth.name}</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-designation">{strings.auth.designation}</Label>
            <Select value={designation} onValueChange={setDesignation}>
              <SelectTrigger id="profile-designation">
                <SelectValue placeholder={strings.auth.selectDesignation} />
              </SelectTrigger>
              <SelectContent>
                {designations.map((option) => (
                  <SelectItem key={option.id} value={option.name}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {!error && !dirty && <p className="text-sm text-muted-foreground">{strings.profile.nothingToSave}</p>}

          <div>
            <Button onClick={handleSave} disabled={!dirty || saving}>
              {saving ? strings.common.saving : strings.common.save}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
