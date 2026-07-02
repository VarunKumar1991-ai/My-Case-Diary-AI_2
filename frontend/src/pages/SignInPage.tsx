import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { authApi, type SigninIdentifier } from "@/apis/auth";
import { ApiError } from "@/apis/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useStrings } from "@/i18n";

type Step = "identify" | "otp";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^(?:\+91|91|0)?[6-9]\d{9}$/;

/**
 * Two-step OTP sign-in (§6.1). The backend deliberately returns the *same*
 * acknowledgement and the *same* failure message whether an account is
 * unknown, blocked, or the code is wrong (`auth/service.ts`:
 * `SIGNIN_OTP_REQUESTED_MESSAGE` / `GENERIC_OTP_FAILURE`) so a caller can never
 * enumerate accounts or block status — this page simply surfaces whatever the
 * API returns rather than inventing a separate "blocked" message.
 *
 * A single field accepts either an email or a mobile number — it's classified
 * by whether it contains "@" and sent as the matching half of `SigninIdentifier`.
 */
export function SignInPage() {
  const strings = useStrings();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [step, setStep] = useState<Step>("identify");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function buildIdentifier(): SigninIdentifier | null {
    const trimmed = identifier.trim();
    if (!trimmed) return null;

    if (trimmed.includes("@")) {
      return EMAIL_PATTERN.test(trimmed) ? { email: trimmed } : null;
    }

    const digits = trimmed.replace(/[\s-]/g, "");
    return MOBILE_PATTERN.test(digits) ? { mobile: digits } : null;
  }

  async function handleIdentifySubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!identifier.trim()) {
      setError(strings.auth.contactRequired);
      return;
    }

    const resolved = buildIdentifier();
    if (!resolved) {
      setError(strings.auth.invalidEmailOrMobile);
      return;
    }

    setSubmitting(true);
    try {
      const { message } = await authApi.signinRequestOtp(resolved);
      toast.success(message);
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtpSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const resolved = buildIdentifier();
    if (!resolved) {
      setError(strings.auth.invalidEmailOrMobile);
      return;
    }

    setSubmitting(true);
    try {
      await authApi.signinVerify({ ...resolved, code: code.trim() });
      await refresh();
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setSubmitting(false);
    }
  }

  function backToIdentify() {
    setStep("identify");
    setCode("");
    setError(null);
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-mono text-primary">{strings.app.name}</CardTitle>
          <CardDescription>
            {step === "identify" ? strings.auth.signInTagline : strings.auth.enterCode}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "identify" ? (
            <form className="space-y-4" onSubmit={(event) => void handleIdentifySubmit(event)}>
              <div className="space-y-2">
                <Label htmlFor="identifier">{strings.auth.emailOrMobile}</Label>
                <Input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="you@example.com or 9876543210"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="border-green-200 hover:border-green-300 focus-visible:border-green-600 focus-visible:ring-green-600/30"
                />
                <p className="text-xs text-muted-foreground">{strings.auth.emailOrMobileHint}</p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? strings.common.saving : strings.auth.sendOtp}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={(event) => void handleOtpSubmit(event)}>
              <div className="space-y-2">
                <Label htmlFor="code">{strings.auth.otpCode}</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
                {submitting ? strings.common.saving : strings.auth.verifyAndContinue}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={backToIdentify}>
                {strings.auth.changeDetails}
              </Button>
            </form>
          )}

          <Link to="/signup" className="block text-center text-sm text-primary underline-offset-4 hover:underline">
            {strings.auth.needAccount}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
