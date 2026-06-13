import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { authApi, type SignupDetails } from "@/apis/auth";
import { ApiError } from "@/apis/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useStrings } from "@/i18n";

type Step = "details" | "otp";

/**
 * Two-step OTP signup (§6.1): collect officer details, request an OTP, then
 * verify it. The details are resent alongside the code on verify because
 * `POST /auth/signup/verify` creates the account in one step (no server-side
 * draft to resume from). Designation is set later, from the profile page.
 */
export function SignUpPage() {
  const strings = useStrings();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [step, setStep] = useState<Step>("details");

  const [pno, setPno] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function buildDetails(): SignupDetails {
    return {
      pno: pno.trim(),
      name: name.trim(),
      email: email.trim() || undefined,
      mobile: mobile.trim() || undefined,
    };
  }

  async function handleDetailsSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!email.trim() && !mobile.trim()) {
      setError(strings.auth.contactRequired);
      return;
    }

    setSubmitting(true);
    try {
      const { message } = await authApi.signupRequestOtp(buildDetails());
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
    setSubmitting(true);
    try {
      await authApi.signupVerify({ ...buildDetails(), code: code.trim() });
      await refresh();
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setSubmitting(false);
    }
  }

  function backToDetails() {
    setStep("details");
    setCode("");
    setError(null);
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-mono text-primary">{strings.app.name}</CardTitle>
          <CardDescription>
            {step === "details" ? strings.auth.signUpTagline : strings.auth.enterCode}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "details" ? (
            <form className="space-y-4" onSubmit={(event) => void handleDetailsSubmit(event)}>
              <div className="space-y-2">
                <Label htmlFor="pno">{strings.auth.pno}</Label>
                <Input id="pno" value={pno} onChange={(e) => setPno(e.target.value)} required minLength={3} maxLength={32} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{strings.auth.name}</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{strings.auth.email}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobile">{strings.auth.mobile}</Label>
                <Input
                  id="mobile"
                  type="tel"
                  inputMode="numeric"
                  placeholder="9876543210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{strings.auth.mobileHint}</p>
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
              <Button type="button" variant="ghost" className="w-full" onClick={backToDetails}>
                {strings.auth.changeDetails}
              </Button>
            </form>
          )}

          <Link to="/signin" className="block text-center text-sm text-primary underline-offset-4 hover:underline">
            {strings.auth.haveAccount}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
