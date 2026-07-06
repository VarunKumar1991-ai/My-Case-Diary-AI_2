import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { caseDiariesApi, type CaseDiary, type CaseDiaryListScope, type DiaryVisibility } from "@/apis/caseDiaries";
import { ApiError } from "@/apis/client";
import { lookupsApi, type LookupOption } from "@/apis/lookups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { useStrings } from "@/i18n";
import { type Strings } from "@/i18n/en";
import { formatDateTime } from "@/lib/utils";

const FIR_FILTER_DEBOUNCE_MS = 350;
const SCOPES: CaseDiaryListScope[] = ["mine", "shared", "public", "all"];

function scopeLabel(scope: CaseDiaryListScope, strings: Strings): string {
  switch (scope) {
    case "mine":      return strings.viewDiaries.scopeMine;
    case "shared":    return strings.viewDiaries.scopeShared;
    case "public":    return strings.viewDiaries.scopePublic;
    case "all":       return strings.viewDiaries.scopeAll;
  }
}

interface FirGroup {
  firNo: string;
  policeStation: string;
  plaintiffName: string;
  accusedName: string;
  caseTypeId: string;
  latestUpdatedAt: number;
  /** true if every diary in this FIR is PUBLIC */
  allPublic: boolean;
  /** id of the first diary in the group — used as the anchor for OTP calls */
  anchorId: string;
  diaries: CaseDiary[];
}

type FetchState =
  | { key: string; status: "ok"; diaries: CaseDiary[] }
  | { key: string; status: "error"; message: string };

interface VisibilityDialogState {
  firNo: string;
  anchorId: string;
  /** The visibility this FIR will switch to when confirmed. */
  target: DiaryVisibility;
  otpSent: boolean;
  code: string;
  submitting: boolean;
  error: string | null;
}

/**
 * View Case Diaries — grouped by FIR number (मुकदमा नंबर).
 * Visibility (Public / Private) is shown and toggled at FIR level:
 * confirming the OTP makes ALL diaries under that FIR number PUBLIC.
 */
export function ViewDiariesPage() {
  const strings = useStrings();
  const { user } = useAuth();

  const [scope, setScope] = useState<CaseDiaryListScope>("mine");
  const [firFilter, setFirFilter] = useState("");
  const [debouncedFirFilter, setDebouncedFirFilter] = useState("");
  const [caseTypes, setCaseTypes] = useState<LookupOption[]>([]);
  const [state, setState] = useState<FetchState | null>(null);
  const [visDialog, setVisDialog] = useState<VisibilityDialogState | null>(null);
  const [alreadyAt, setAlreadyAt] = useState<{ firNo: string; visibility: DiaryVisibility } | null>(null);

  const requestKey = `${scope}::${debouncedFirFilter}`;
  const loading = state === null || state.key !== requestKey;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedFirFilter(firFilter.trim()), FIR_FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [firFilter]);

  useEffect(() => {
    let cancelled = false;
    lookupsApi.listCaseTypes()
      .then(({ caseTypes: opts }) => { if (!cancelled) setCaseTypes(opts); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const caseTypeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of caseTypes) map.set(opt.id, opt.name);
    return map;
  }, [caseTypes]);

  useEffect(() => {
    let cancelled = false;
    const key = `${scope}::${debouncedFirFilter}`;
    caseDiariesApi.list({ scope, firNo: debouncedFirFilter || undefined })
      .then(({ caseDiaries }) => { if (!cancelled) setState({ key, status: "ok", diaries: caseDiaries }); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ key, status: "error", message: err instanceof ApiError ? err.message : strings.common.somethingWentWrong });
      });
    return () => { cancelled = true; };
  }, [scope, debouncedFirFilter, strings.common.somethingWentWrong]);

  const diaries = state?.status === "ok" ? state.diaries : [];

  const firGroups = useMemo((): FirGroup[] => {
    const map = new Map<string, CaseDiary[]>();
    for (const diary of diaries) {
      const group = map.get(diary.firNo) ?? [];
      group.push(diary);
      map.set(diary.firNo, group);
    }
    return Array.from(map.entries())
      .map(([firNo, entries]) => {
        const sorted = [...entries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const latest = sorted.reduce((max, d) => Math.max(max, new Date(d.updatedAt).getTime()), 0);
        return {
          firNo,
          policeStation: sorted[0]!.policeStation,
          plaintiffName: sorted[0]!.plaintiffName,
          accusedName: sorted[0]!.accusedName,
          caseTypeId: sorted[0]!.caseTypeId,
          latestUpdatedAt: latest,
          allPublic: sorted.every((d) => d.visibility === "PUBLIC"),
          anchorId: sorted[0]!.id,
          diaries: sorted,
        };
      })
      .sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt);
  }, [diaries]);

  function openVisibilityDialog(group: FirGroup) {
    // FIR-scoped toggle: if every diary is public, the next step makes it private, and vice-versa.
    const target: DiaryVisibility = group.allPublic ? "PRIVATE" : "PUBLIC";
    setVisDialog({ firNo: group.firNo, anchorId: group.anchorId, target, otpSent: false, code: "", submitting: false, error: null });
  }

  async function handleRequestOtp() {
    if (!visDialog) return;
    setVisDialog((d) => d && { ...d, submitting: true, error: null });
    try {
      await caseDiariesApi.requestVisibilityOtp(visDialog.anchorId, visDialog.target);
      setVisDialog((d) => d && { ...d, otpSent: true, submitting: false });
      toast.success(strings.editor.otpSent);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // All CDs for this FIR are already at the target visibility — close OTP dialog, show info box.
        setVisDialog(null);
        setAlreadyAt({ firNo: visDialog.firNo, visibility: visDialog.target });
      } else {
        setVisDialog((d) => d && { ...d, submitting: false, error: err instanceof ApiError ? err.message : strings.common.somethingWentWrong });
      }
    }
  }

  async function handleConfirmOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!visDialog) return;
    setVisDialog((d) => d && { ...d, submitting: true, error: null });
    try {
      await caseDiariesApi.confirmVisibility(visDialog.anchorId, visDialog.target, visDialog.code.trim());
      toast.success(strings.editor.visibilityChanged);
      setVisDialog(null);
      // Refresh the list so visibility badges update.
      setState(null);
    } catch (err) {
      setVisDialog((d) => d && { ...d, submitting: false, error: err instanceof ApiError ? err.message : strings.common.somethingWentWrong });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{strings.viewDiaries.heading}</h1>
        <p className="text-sm text-muted-foreground">{strings.viewDiaries.subheading}</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={scope} onValueChange={(v) => setScope(v as CaseDiaryListScope)}>
          <TabsList>
            {SCOPES.map((v) => (
              <TabsTrigger key={v} value={v}>{scopeLabel(v, strings)}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          value={firFilter}
          onChange={(e) => setFirFilter(e.target.value)}
          placeholder={strings.viewDiaries.firFilterPlaceholder}
          className="sm:w-64"
        />
      </div>

      <div className="flex flex-col gap-6">
        {loading && <p className="text-sm text-muted-foreground">{strings.common.loading}</p>}
        {!loading && state?.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
        {!loading && state?.status === "ok" && firGroups.length === 0 && (
          <p className="text-sm text-muted-foreground">{strings.viewDiaries.empty}</p>
        )}

        {!loading && firGroups.map((group) => (
          <div key={group.firNo} className="flex flex-col gap-2">
            {/* FIR section header */}
            <div className="rounded-md border border-border bg-secondary px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-primary">
                  मुकदमा नं. {group.firNo}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={group.allPublic ? "default" : "outline"}>
                    {group.allPublic ? strings.diary.public : strings.diary.private}
                  </Badge>
                  <Badge variant="outline">
                    {caseTypeNameById.get(group.caseTypeId) ?? group.caseTypeId}
                  </Badge>
                  {/* Owner can toggle either way: make public if private, make private if public */}
                  {scope === "mine" && user && (
                    <Button variant="outline" size="sm" onClick={() => openVisibilityDialog(group)}>
                      {group.allPublic ? strings.editor.makePrivate : strings.editor.makePublic}
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {group.policeStation} · {group.plaintiffName} vs. {group.accusedName}
              </p>
            </div>

            {/* Case diaries within this FIR, numbered from 1 */}
            <div className="flex flex-col gap-2 border-l-2 border-border ml-2 pl-4">
              {group.diaries.map((diary, index) => (
                <Link key={diary.id} to={`/diary/${diary.id}`}>
                  <Card className="transition-colors hover:border-primary/60">
                    <CardContent className="flex flex-col gap-1.5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-primary">
                          केस डायरी नं. {index + 1}
                        </span>
                        <Badge variant={diary.status === "finalized" ? "default" : "secondary"}>
                          {diary.status === "finalized" ? strings.diary.finalized : strings.diary.draft}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {diary.underSection} · Updated {formatDateTime(diary.updatedAt)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Info dialog — all CDs already at the requested visibility */}
      <Dialog open={alreadyAt !== null} onOpenChange={(open) => { if (!open) setAlreadyAt(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>सूचना</DialogTitle>
            <DialogDescription>
              {alreadyAt &&
                `मुकदमा नं. ${alreadyAt.firNo} की सभी केस डायरी पहले से ही ${alreadyAt.visibility === "PUBLIC" ? "Public" : "Private"} हैं।`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setAlreadyAt(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FIR-level visibility OTP dialog */}
      <Dialog open={visDialog !== null} onOpenChange={(open) => { if (!open) setVisDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {visDialog?.target === "PRIVATE" ? strings.editor.makePrivateConfirmTitle : strings.editor.makePublicConfirmTitle}
            </DialogTitle>
            <DialogDescription>
              {visDialog &&
                `मुकदमा नं. ${visDialog.firNo} की सारी केस डायरी ${visDialog.target === "PUBLIC" ? "Public" : "Private"} हो जाएंगी।`}
            </DialogDescription>
          </DialogHeader>

          {visDialog && !visDialog.otpSent ? (
            <>
              {visDialog.error && <p className="text-sm text-destructive">{visDialog.error}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setVisDialog(null)}>{strings.common.cancel}</Button>
                <Button onClick={() => void handleRequestOtp()} disabled={visDialog.submitting}>
                  {visDialog.submitting ? strings.editor.sendingCode : strings.editor.sendCode}
                </Button>
              </DialogFooter>
            </>
          ) : visDialog ? (
            <form onSubmit={(e) => void handleConfirmOtp(e)} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="vis-otp-view">{strings.editor.enterCode}</Label>
                <Input
                  id="vis-otp-view"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={visDialog.code}
                  onChange={(e) => setVisDialog((d) => d && { ...d, code: e.target.value.replace(/\D/g, "") })}
                  required
                />
              </div>
              {visDialog.error && <p className="text-sm text-destructive">{visDialog.error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setVisDialog(null)}>{strings.common.cancel}</Button>
                <Button type="submit" disabled={visDialog.submitting || visDialog.code.length !== 6}>
                  {visDialog.submitting ? strings.editor.confirming : strings.editor.confirm}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
