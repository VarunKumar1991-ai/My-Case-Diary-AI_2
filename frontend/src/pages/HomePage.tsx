import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { caseDiariesApi, type CaseDiary, type DiaryVisibility } from "@/apis/caseDiaries";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStrings } from "@/i18n";
import {
  formatDateTime,
  fromDateDisplay,
  fromDateTimeDisplay,
} from "@/lib/utils";

const QUICK_SEARCH_LIMIT = 6;

interface InvForm {
  cdNo: string;
  cdDate: string;            // dd/mm/yyyy text — optional
  caseTypeId: string;
  firNo: string;
  underSection: string;
  policeStation: string;
  incidentDisplay: string;   // dd/mm/yyyy HH:mm text
  firRegDisplay: string;     // dd/mm/yyyy HH:mm text
  placeOfIncidence: string;
  plaintiffName: string;
  accusedName: string;
  visibility: DiaryVisibility;
}

const EMPTY_INV: InvForm = {
  cdNo: "CD-001",
  cdDate: "",
  caseTypeId: "",
  firNo: "",
  underSection: "",
  policeStation: "",
  incidentDisplay: "",
  firRegDisplay: "",
  placeOfIncidence: "",
  plaintiffName: "",
  accusedName: "",
  visibility: "PUBLIC",
};

/**
 * §6.5: "centered, Google-style search/suggestion box as the primary
 * post-login action — the anchor UX moment". Quick-search chips double as the
 * "suggestion" half before the officer has typed anything (drawn from the
 * active case-type taxonomy via the `lookups` module); submitting the box
 * hits `GET /case-diaries/search` (D6 `SearchService`, keyword/FTS in Phase 1).
 */
export function HomePage() {
  const strings = useStrings();
  const navigate = useNavigate();

  const [caseTypes, setCaseTypes] = useState<LookupOption[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [results, setResults] = useState<CaseDiary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── "Start a new investigation" dialog state ────────────────────────────────
  const [invOpen, setInvOpen] = useState(false);
  const [invForm, setInvForm] = useState<InvForm>({ ...EMPTY_INV });
  const [invSubmitting, setInvSubmitting] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    lookupsApi
      .listCaseTypes()
      .then(({ caseTypes: options }) => {
        if (!cancelled) setCaseTypes(options);
      })
      .catch(() => {
        // Quick-search chips are a nicety on top of the search box — degrade silently if the lookup fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const caseTypeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of caseTypes) map.set(option.id, option.name);
    return map;
  }, [caseTypes]);

  function setInv<K extends keyof InvForm>(key: K, value: InvForm[K]) {
    setInvForm((prev) => ({ ...prev, [key]: value }));
  }

  function openInvDialog() {
    setInvForm({ ...EMPTY_INV });
    setInvError(null);
    setInvOpen(true);
  }

  async function handleStartInvestigation(e: FormEvent) {
    e.preventDefault();
    setInvError(null);

    const incidentDateTime = fromDateTimeDisplay(invForm.incidentDisplay);
    if (!incidentDateTime) {
      setInvError("Incident date & time is invalid — use dd/mm/yyyy HH:mm format.");
      return;
    }
    const firRegistrationDateTime = fromDateTimeDisplay(invForm.firRegDisplay);
    if (!firRegistrationDateTime) {
      setInvError("FIR registration date & time is invalid — use dd/mm/yyyy HH:mm format.");
      return;
    }

    setInvSubmitting(true);
    try {
      const { caseDiary } = await caseDiariesApi.create({
        caseDiaryNo: invForm.cdNo.trim() || undefined,
        caseDiaryDate: fromDateDisplay(invForm.cdDate) || undefined,
        caseTypeId: invForm.caseTypeId,
        firNo: invForm.firNo.trim(),
        underSection: invForm.underSection.trim(),
        policeStation: invForm.policeStation.trim(),
        incidentDateTime,
        firRegistrationDateTime,
        placeOfIncidence: invForm.placeOfIncidence.trim(),
        plaintiffName: invForm.plaintiffName.trim(),
        accusedName: invForm.accusedName.trim(),
        visibility: invForm.visibility,
        body: {},
      });
      setInvOpen(false);
      setInvForm({ ...EMPTY_INV });
      navigate(`/diary/${caseDiary.id}`);
    } catch (err) {
      setInvError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setInvSubmitting(false);
    }
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  async function runSearch(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;

    setQuery(trimmed);
    setSubmittedQuery(trimmed);
    setSearching(true);
    setError(null);
    try {
      const { caseDiaries } = await caseDiariesApi.search(trimmed);
      setResults(caseDiaries);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void runSearch(query);
  }

  const hasSearched = submittedQuery !== null;

  return (
    <>
      {/* ── New Investigation Dialog ─────────────────────────────────────────── */}
      <Dialog open={invOpen} onOpenChange={setInvOpen}>
        <DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{strings.home.investigationDialogTitle}</DialogTitle>
            <DialogDescription>{strings.home.investigationDialogDesc}</DialogDescription>
          </DialogHeader>

          <form id="inv-form" onSubmit={(e) => void handleStartInvestigation(e)}>
            <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
              {/* CD No */}
              <div className="space-y-1.5">
                <Label htmlFor="inv-cdNo">{strings.diary.fields.caseDiaryNo}</Label>
                <Input
                  id="inv-cdNo"
                  value={invForm.cdNo}
                  onChange={(e) => setInv("cdNo", e.target.value)}
                  placeholder="CD-001"
                />
              </div>

              {/* CD Date */}
              <div className="space-y-1.5">
                <Label htmlFor="inv-cdDate">{strings.home.investigationCdDate}</Label>
                <Input
                  id="inv-cdDate"
                  value={invForm.cdDate}
                  onChange={(e) => setInv("cdDate", e.target.value)}
                  placeholder="dd/mm/yyyy"
                  maxLength={10}
                  inputMode="numeric"
                />
              </div>

              {/* Case Type */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="inv-caseType">{strings.diary.fields.caseType}</Label>
                <Select
                  value={invForm.caseTypeId}
                  onValueChange={(v) => setInv("caseTypeId", v)}
                  required
                >
                  <SelectTrigger id="inv-caseType">
                    <SelectValue placeholder={strings.editor.selectCaseType} />
                  </SelectTrigger>
                  <SelectContent>
                    {caseTypes.map((ct) => (
                      <SelectItem key={ct.id} value={ct.id}>
                        {ct.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* FIR No */}
              <div className="space-y-1.5">
                <Label htmlFor="inv-firNo">{strings.diary.fields.firNo}</Label>
                <Input
                  id="inv-firNo"
                  value={invForm.firNo}
                  onChange={(e) => setInv("firNo", e.target.value)}
                  placeholder="Fill FIR no"
                  required
                />
              </div>

              {/* Under Section */}
              <div className="space-y-1.5">
                <Label htmlFor="inv-underSection">{strings.diary.fields.underSection}</Label>
                <Input
                  id="inv-underSection"
                  value={invForm.underSection}
                  onChange={(e) => setInv("underSection", e.target.value)}
                  placeholder="Fill section"
                  required
                />
              </div>

              {/* Police Station */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="inv-policeStation">{strings.diary.fields.policeStation}</Label>
                <Input
                  id="inv-policeStation"
                  value={invForm.policeStation}
                  onChange={(e) => setInv("policeStation", e.target.value)}
                  placeholder="Kotwali"
                  required
                />
              </div>

              {/* Incident Date & Time */}
              <div className="space-y-1.5">
                <Label htmlFor="inv-incidentDT">{strings.diary.fields.incidentDateTime}</Label>
                <Input
                  id="inv-incidentDT"
                  value={invForm.incidentDisplay}
                  onChange={(e) => setInv("incidentDisplay", e.target.value)}
                  placeholder="dd/mm/yyyy HH:mm"
                  maxLength={16}
                  inputMode="numeric"
                  required
                />
              </div>

              {/* FIR Registration Date & Time */}
              <div className="space-y-1.5">
                <Label htmlFor="inv-firRegDT">{strings.diary.fields.firRegistrationDateTime}</Label>
                <Input
                  id="inv-firRegDT"
                  value={invForm.firRegDisplay}
                  onChange={(e) => setInv("firRegDisplay", e.target.value)}
                  placeholder="dd/mm/yyyy HH:mm"
                  maxLength={16}
                  inputMode="numeric"
                  required
                />
              </div>

              {/* Place of Incidence */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="inv-place">{strings.diary.fields.placeOfIncidence}</Label>
                <Input
                  id="inv-place"
                  value={invForm.placeOfIncidence}
                  onChange={(e) => setInv("placeOfIncidence", e.target.value)}
                  required
                />
              </div>

              {/* Plaintiff Name */}
              <div className="space-y-1.5">
                <Label htmlFor="inv-plaintiff">{strings.diary.fields.plaintiffName}</Label>
                <Input
                  id="inv-plaintiff"
                  value={invForm.plaintiffName}
                  onChange={(e) => setInv("plaintiffName", e.target.value)}
                  required
                />
              </div>

              {/* Accused Name */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="inv-accused">{strings.diary.fields.accusedName}</Label>
                <Textarea
                  id="inv-accused"
                  value={invForm.accusedName}
                  onChange={(e) => setInv("accusedName", e.target.value)}
                  maxLength={10000}
                  rows={3}
                  required
                />
              </div>
            </div>

            {invError && (
              <p className="mt-2 text-sm text-destructive">{invError}</p>
            )}
          </form>

          <DialogFooter className="sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="inv-visibility" className="whitespace-nowrap">
                {strings.home.visibilityLabel}
              </Label>
              <Select
                value={invForm.visibility}
                onValueChange={(v) => setInv("visibility", v as DiaryVisibility)}
              >
                <SelectTrigger id="inv-visibility" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC">{strings.diary.public}</SelectItem>
                  <SelectItem value="PRIVATE">{strings.diary.private}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setInvOpen(false)}
              disabled={invSubmitting}
            >
              {strings.common.cancel}
            </Button>
            <Button
              type="submit"
              form="inv-form"
              disabled={invSubmitting || !invForm.caseTypeId}
            >
              {invSubmitting
                ? strings.home.startingInvestigation
                : strings.home.startInvestigation}
            </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Main page ────────────────────────────────────────────────────────── */}
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-4 py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="font-mono text-3xl font-semibold tracking-tight text-primary">
            {"> "}
            {strings.app.name}
          </span>
          <p className="max-w-xl text-sm text-muted-foreground">{strings.app.tagline}</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full max-w-xl">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={strings.home.searchPlaceholder}
              aria-label={strings.home.searchPlaceholder}
              className="h-12 rounded-full pr-28 pl-11 text-base shadow-xs"
            />
            <Button
              type="submit"
              size="sm"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full px-4"
              disabled={!query.trim() || searching}
            >
              {searching ? strings.home.searching : strings.common.search}
            </Button>
          </div>
        </form>

        {!hasSearched && (
          <div className="flex w-full flex-col items-center gap-6">
            {caseTypes.length > 0 && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">{strings.home.suggestionsLabel}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {caseTypes.slice(0, QUICK_SEARCH_LIMIT).map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => void runSearch(type.name)}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      {type.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button variant="outline" className="gap-2" onClick={openInvDialog}>
              <PlusIcon className="size-4" />
              {strings.home.startNewInvestigation}
            </Button>
          </div>
        )}

        {hasSearched && (
          <div className="w-full max-w-2xl space-y-3">
            {error && <p className="text-center text-sm text-destructive">{error}</p>}

            {!error && !searching && results.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">{strings.home.noResults}</p>
            )}

            {results.map((diary) => (
              <Link key={diary.id} to={`/diary/${diary.id}`}>
                <Card className="transition-colors hover:border-primary/60">
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-primary">{diary.caseDiaryNo}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{caseTypeNameById.get(diary.caseTypeId) ?? diary.caseTypeId}</Badge>
                        <Badge variant={diary.status === "finalized" ? "default" : "secondary"}>
                          {diary.status === "finalized" ? strings.diary.finalized : strings.diary.draft}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-sm text-foreground">
                      FIR {diary.firNo} · {diary.underSection}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {diary.plaintiffName} vs. {diary.accusedName} · Updated {formatDateTime(diary.updatedAt)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
