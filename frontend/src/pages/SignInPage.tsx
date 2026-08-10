import { BookOpenTextIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { authApi, type SigninIdentifier } from "@/apis/auth";
import { ApiError } from "@/apis/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useStrings } from "@/i18n";
import { AboutPortalContent } from "@/pages/AboutPortalPage";

type Mode = "password" | "otp" | "forgot";
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

  const [mode, setMode] = useState<Mode>("password");
  const [step, setStep] = useState<Step>("identify");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  /** PNO or registered email — either identifies the account for password sign-in. */
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setStep("identify");
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.signinPassword({ identifier: loginId.trim(), password });
      await refresh();
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setSubmitting(false);
    }
  }

  /** "Forgot password?" — set a new password using the current one. */
  async function handleResetSubmit(event: FormEvent) {
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

    setSubmitting(true);
    try {
      await authApi.resetPassword({ identifier: loginId.trim(), currentPassword: password, newPassword });
      toast.success(strings.auth.passwordChanged);
      // Straight into the app with the password they just set.
      await authApi.signinPassword({ identifier: loginId.trim(), password: newPassword });
      await refresh();
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setSubmitting(false);
    }
  }

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
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background px-4 py-10">
      {/* Brand sits above the card, on the page itself — the card's border stays unbroken. */}
      <h1 className="text-center font-mono text-2xl leading-tight font-semibold text-primary">{strings.app.name}</h1>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardDescription>
            {mode === "forgot"
              ? strings.auth.resetPasswordTagline
              : mode === "password"
                ? strings.auth.passwordSignInTagline
                : step === "identify"
                  ? strings.auth.signInTagline
                  : strings.auth.enterCode}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sign-in method: ID/password or OTP. Hidden inside the "forgot
              password" sub-flow, which has its own "Back to sign in" action. */}
          <div
            className={"flex flex-wrap gap-x-5 gap-y-2 " + (mode === "forgot" ? "hidden" : "")}
            role="radiogroup"
            aria-label={strings.auth.signInMethod}
          >
            {(["password", "otp"] as const).map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground"
              >
                <input
                  type="radio"
                  name="signin-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => switchMode(value)}
                  className="size-4 shrink-0 accent-primary"
                />
                {value === "password" ? strings.auth.loginWithPassword : strings.auth.loginWithOtp}
              </label>
            ))}
          </div>

          {/* Reserves the height of the tallest sign-in form (the password one),
              so switching between Password and OTP doesn't resize the card and
              jolt the whole centred layout up or down. Taller flows (the OTP
              code step, "forgot password") simply grow past this floor. */}
          <div className="min-h-[188px]">
            {mode === "password" ? (
            <form className="space-y-4" onSubmit={(event) => void handlePasswordSubmit(event)}>
              <div className="space-y-2">
                <Label htmlFor="login-id">{strings.auth.pnoOrEmail}</Label>
                <Input
                  id="login-id"
                  type="text"
                  autoComplete="username"
                  placeholder={strings.auth.pnoOrEmailPlaceholder}
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="password">{strings.auth.password}</Label>
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {strings.auth.forgotPassword}
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={submitting || !loginId.trim() || !password}>
                {submitting ? strings.common.saving : strings.auth.login}
              </Button>
            </form>
          ) : mode === "forgot" ? (
            <form className="space-y-4" onSubmit={(event) => void handleResetSubmit(event)}>
              <div className="space-y-2">
                <Label htmlFor="reset-id">{strings.auth.pnoOrEmail}</Label>
                <Input
                  id="reset-id"
                  type="text"
                  autoComplete="username"
                  placeholder={strings.auth.pnoOrEmailPlaceholder}
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reset-current">{strings.auth.currentPassword}</Label>
                <Input
                  id="reset-current"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reset-new">{strings.auth.newPassword}</Label>
                <Input
                  id="reset-new"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{strings.auth.passwordRule}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reset-confirm">{strings.auth.confirmNewPassword}</Label>
                <Input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <p className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                {strings.auth.forgotPasswordHint}
              </p>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !loginId.trim() || !password || !newPassword || !confirmPassword}
              >
                {submitting ? strings.common.saving : strings.auth.setNewPassword}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => switchMode("password")}>
                {strings.auth.backToSignIn}
              </Button>
            </form>
          ) : step === "identify" ? (
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
          </div>

          <Link to="/signup" className="block text-center text-sm text-primary underline-offset-4 hover:underline">
            {strings.auth.needAccount}
          </Link>
        </CardContent>
      </Card>

      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex w-fit shrink-0 cursor-pointer items-center justify-center gap-1 rounded-full bg-green-400 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-green-950"
          >
            <BookOpenTextIcon className="size-3.5" />
            {strings.auth.aboutMeChip}
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{strings.about.heading}</DialogTitle>
          </DialogHeader>
          <AboutPortalContent />
        </DialogContent>
      </Dialog>
    </div>
  );
}
