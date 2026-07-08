import { useEffect, useState, type FormEvent } from "react";
import { PlusIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { caseDiariesApi, type DiaryVisibility } from "@/apis/caseDiaries";
import { ApiError } from "@/apis/client";
import { lookupsApi, type LookupOption } from "@/apis/lookups";
import { Button } from "@/components/ui/button";
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
import { cn, fromDateDisplay, fromDateTimeDisplay } from "@/lib/utils";

interface InvForm {
  cdNo: string;
  cdDate: string; // dd/mm/yyyy text — optional
  caseTypeId: string;
  firNo: string;
  underSection: string;
  policeStation: string;
  incidentDisplay: string; // dd/mm/yyyy HH:mm text
  firRegDisplay: string; // dd/mm/yyyy HH:mm text
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
 * The "Start a new investigation" primary action — a trigger button plus its
 * popup that captures the full FIR header and creates the first case diary
 * (CD-001). Lives in the sidebar so it's reachable from anywhere; on success it
 * navigates to the new diary's editor.
 */
export function NewInvestigationDialog({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  const strings = useStrings();
  const navigate = useNavigate();

  const [caseTypes, setCaseTypes] = useState<LookupOption[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<InvForm>({ ...EMPTY_INV });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load case types once the dialog is first opened (keeps the sidebar cheap on mount).
  useEffect(() => {
    if (!open || caseTypes.length > 0) return;
    let cancelled = false;
    lookupsApi
      .listCaseTypes()
      .then(({ caseTypes: options }) => {
        if (!cancelled) setCaseTypes(options);
      })
      .catch(() => {
        // The case-type select degrades to empty if the lookup fails — the officer can retry.
      });
    return () => {
      cancelled = true;
    };
  }, [open, caseTypes.length]);

  function setField<K extends keyof InvForm>(key: K, value: InvForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openDialog() {
    setForm({ ...EMPTY_INV });
    setError(null);
    setOpen(true);
  }

  async function handleStartInvestigation(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const incidentDateTime = fromDateTimeDisplay(form.incidentDisplay);
    if (!incidentDateTime) {
      setError("Incident date & time is invalid — use dd/mm/yyyy HH:mm format.");
      return;
    }
    const firRegistrationDateTime = fromDateTimeDisplay(form.firRegDisplay);
    if (!firRegistrationDateTime) {
      setError("FIR registration date & time is invalid — use dd/mm/yyyy HH:mm format.");
      return;
    }

    setSubmitting(true);
    try {
      const { caseDiary } = await caseDiariesApi.create({
        caseDiaryNo: form.cdNo.trim() || undefined,
        caseDiaryDate: fromDateDisplay(form.cdDate) || undefined,
        caseTypeId: form.caseTypeId,
        firNo: form.firNo.trim(),
        underSection: form.underSection.trim(),
        policeStation: form.policeStation.trim(),
        incidentDateTime,
        firRegistrationDateTime,
        placeOfIncidence: form.placeOfIncidence.trim(),
        plaintiffName: form.plaintiffName.trim(),
        accusedName: form.accusedName.trim(),
        visibility: form.visibility,
        body: {},
      });
      setOpen(false);
      setForm({ ...EMPTY_INV });
      navigate(`/diary/${caseDiary.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Styled to match the sidebar nav links (e.g. "Home") so the left panel stays
          uniform — collapses to an icon-only button when the sidebar is a rail. */}
      <Button
        variant="ghost"
        title={strings.home.startNewInvestigation}
        className={cn(
          "h-auto w-full rounded-md py-2 text-sm font-medium",
          "text-muted-foreground hover:bg-secondary hover:text-foreground",
          collapsed ? "justify-center px-0" : "justify-start gap-3 px-3",
          className,
        )}
        onClick={openDialog}
      >
        <PlusIcon className="size-4 shrink-0" />
        {!collapsed && strings.home.startNewInvestigation}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
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
                  value={form.cdNo}
                  onChange={(e) => setField("cdNo", e.target.value)}
                  placeholder="CD-001"
                />
              </div>

              {/* CD Date */}
              <div className="space-y-1.5">
                <Label htmlFor="inv-cdDate">{strings.home.investigationCdDate}</Label>
                <Input
                  id="inv-cdDate"
                  value={form.cdDate}
                  onChange={(e) => setField("cdDate", e.target.value)}
                  placeholder="dd/mm/yyyy"
                  maxLength={10}
                  inputMode="numeric"
                />
              </div>

              {/* Case Type */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="inv-caseType">{strings.diary.fields.caseType}</Label>
                <Select value={form.caseTypeId} onValueChange={(v) => setField("caseTypeId", v)} required>
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
                  value={form.firNo}
                  onChange={(e) => setField("firNo", e.target.value)}
                  placeholder="Fill FIR no"
                  required
                />
              </div>

              {/* Under Section */}
              <div className="space-y-1.5">
                <Label htmlFor="inv-underSection">{strings.diary.fields.underSection}</Label>
                <Input
                  id="inv-underSection"
                  value={form.underSection}
                  onChange={(e) => setField("underSection", e.target.value)}
                  placeholder="Fill section"
                  required
                />
              </div>

              {/* Police Station */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="inv-policeStation">{strings.diary.fields.policeStation}</Label>
                <Input
                  id="inv-policeStation"
                  value={form.policeStation}
                  onChange={(e) => setField("policeStation", e.target.value)}
                  placeholder="Kotwali"
                  required
                />
              </div>

              {/* Incident Date & Time */}
              <div className="space-y-1.5">
                <Label htmlFor="inv-incidentDT">{strings.diary.fields.incidentDateTime}</Label>
                <Input
                  id="inv-incidentDT"
                  value={form.incidentDisplay}
                  onChange={(e) => setField("incidentDisplay", e.target.value)}
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
                  value={form.firRegDisplay}
                  onChange={(e) => setField("firRegDisplay", e.target.value)}
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
                  value={form.placeOfIncidence}
                  onChange={(e) => setField("placeOfIncidence", e.target.value)}
                  required
                />
              </div>

              {/* Plaintiff Name */}
              <div className="space-y-1.5">
                <Label htmlFor="inv-plaintiff">{strings.diary.fields.plaintiffName}</Label>
                <Input
                  id="inv-plaintiff"
                  value={form.plaintiffName}
                  onChange={(e) => setField("plaintiffName", e.target.value)}
                  required
                />
              </div>

              {/* Accused Name */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="inv-accused">{strings.diary.fields.accusedName}</Label>
                <Textarea
                  id="inv-accused"
                  value={form.accusedName}
                  onChange={(e) => setField("accusedName", e.target.value)}
                  maxLength={10000}
                  rows={3}
                  required
                />
              </div>
            </div>

            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </form>

          <DialogFooter className="sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="inv-visibility" className="whitespace-nowrap">
                {strings.home.visibilityLabel}
              </Label>
              <Select value={form.visibility} onValueChange={(v) => setField("visibility", v as DiaryVisibility)}>
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                {strings.common.cancel}
              </Button>
              <Button type="submit" form="inv-form" disabled={submitting || !form.caseTypeId}>
                {submitting ? strings.home.startingInvestigation : strings.home.startInvestigation}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
