import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { type JSONContent, useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { toast } from "sonner";

import {
  caseDiariesApi,
  type CaseDiary,
  type CaseDiaryHeaderInput,
} from "@/apis/caseDiaries";
import { ApiError } from "@/apis/client";
import { lookupsApi, type LookupOption } from "@/apis/lookups";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/AuthContext";
import { type Strings } from "@/i18n/en";
import { useStrings } from "@/i18n";
import { cn, formatDateTime } from "@/lib/utils";

const SAVE_DEBOUNCE_MS = 1000;

const EDITOR_CONTENT_CLASS =
  "min-h-[40svh] font-mono text-sm leading-relaxed text-foreground focus:outline-none " +
  "[&_p]:my-2 [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold " +
  "[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold " +
  "[&_ul]:my-2 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:ml-5 [&_ol]:list-decimal " +
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground " +
  "[&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs " +
  "[&_strong]:font-semibold [&_em]:italic";

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface HeaderFormState {
  caseTypeId: string;
  firNo: string;
  underSection: string;
  policeStation: string;
  /** Stored as ISO 8601 — converted to/from `datetime-local` only at the input boundary. */
  incidentDateTime: string;
  firRegistrationDateTime: string;
  placeOfIncidence: string;
  plaintiffName: string;
  accusedName: string;
}

const EMPTY_HEADER: HeaderFormState = {
  caseTypeId: "",
  firNo: "",
  underSection: "",
  policeStation: "",
  incidentDateTime: "",
  firRegistrationDateTime: "",
  placeOfIncidence: "",
  plaintiffName: "",
  accusedName: "",
};

function toHeaderForm(diary: CaseDiary): HeaderFormState {
  return {
    caseTypeId: diary.caseTypeId,
    firNo: diary.firNo,
    underSection: diary.underSection,
    policeStation: diary.policeStation,
    incidentDateTime: diary.incidentDateTime,
    firRegistrationDateTime: diary.firRegistrationDateTime,
    placeOfIncidence: diary.placeOfIncidence,
    plaintiffName: diary.plaintiffName,
    accusedName: diary.accusedName,
  };
}

function buildHeaderPayload(header: HeaderFormState): CaseDiaryHeaderInput {
  return {
    caseTypeId: header.caseTypeId,
    firNo: header.firNo.trim(),
    underSection: header.underSection.trim(),
    policeStation: header.policeStation.trim(),
    incidentDateTime: header.incidentDateTime,
    firRegistrationDateTime: header.firRegistrationDateTime,
    placeOfIncidence: header.placeOfIncidence.trim(),
    plaintiffName: header.plaintiffName.trim(),
    accusedName: header.accusedName.trim(),
  };
}

function isHeaderComplete(header: HeaderFormState): boolean {
  return Object.values(header).every((value) => value.trim().length > 0);
}

function toDatetimeLocalValue(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function isProseMirrorDoc(value: unknown): value is JSONContent {
  return Boolean(value && typeof value === "object" && "type" in (value as Record<string, unknown>));
}

function extractPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as { text?: unknown; content?: unknown };
  const parts: string[] = [];
  if (typeof record.text === "string") parts.push(record.text);
  if (Array.isArray(record.content)) {
    for (const child of record.content) parts.push(extractPlainText(child));
  }
  return parts.join(" ");
}

function snippet(text: string, maxLength = 140): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength)}…` : collapsed;
}

function saveStatusLabel(status: SaveStatus, strings: Strings): string | null {
  switch (status) {
    case "pending":
    case "saving":
      return strings.common.saving;
    case "saved":
      return strings.common.saved;
    case "error":
      return strings.common.somethingWentWrong;
    default:
      return null;
  }
}

function HeaderField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

interface PrefillState {
  prefill?: Partial<HeaderFormState>;
}

/**
 * §6.5: the system's core workspace — three panels around a Tiptap body editor.
 * Left: diaries sharing this FIR (+ "new diary for this FIR"). Centre: header
 * fields + rich-text body, autosaved via debounced `PUT` (existing diaries) or
 * created explicitly via `POST` (new diaries — the payload must be complete).
 * Right: real "similar past cases" (D7 `SimilarCaseService` seam) and a
 * Phase-1 "AI suggestions" placeholder.
 */
export function DiaryEditorPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const strings = useStrings();
  const { user } = useAuth();

  const isNew = !id;
  const prefill = (location.state as PrefillState | null)?.prefill;

  const [caseTypes, setCaseTypes] = useState<LookupOption[]>([]);
  const [diary, setDiary] = useState<CaseDiary | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [header, setHeaderState] = useState<HeaderFormState>(() => ({ ...EMPTY_HEADER, ...prefill }));
  const headerRef = useRef(header);

  /** Keeps `headerRef` in lock-step with every `setHeader` call so the debounced `persist` below — which may fire long after the render that scheduled it — always reads the latest values rather than a stale closure. */
  function setHeader(value: HeaderFormState | ((prev: HeaderFormState) => HeaderFormState)) {
    setHeaderState((prev) => {
      const next = typeof value === "function" ? (value as (p: HeaderFormState) => HeaderFormState)(prev) : value;
      headerRef.current = next;
      return next;
    });
  }

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimerRef = useRef<number | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /** `null` = not yet fetched (drives the loading indicator without a separate boolean). */
  const [firDiaries, setFirDiaries] = useState<CaseDiary[] | null>(null);
  const [similar, setSimilar] = useState<CaseDiary[] | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [visibilityOtpSent, setVisibilityOtpSent] = useState(false);
  const [visibilityCode, setVisibilityCode] = useState("");
  const [visibilitySubmitting, setVisibilitySubmitting] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);

  function persist() {
    if (!diary || !editor) return;
    setSaveStatus("saving");
    caseDiariesApi
      .update(diary.id, { ...buildHeaderPayload(headerRef.current), body: editor.getJSON() })
      .then(({ caseDiary }) => {
        setDiary(caseDiary);
        setSaveStatus("saved");
      })
      .catch((err: unknown) => {
        setSaveStatus("error");
        toast.error(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
      });
  }

  function scheduleAutosave() {
    if (!diary) return;
    setSaveStatus("pending");
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      persist();
    }, SAVE_DEBOUNCE_MS);
  }

  function updateHeader<K extends keyof HeaderFormState>(key: K, value: HeaderFormState[K]) {
    setHeader((prev) => ({ ...prev, [key]: value }));
    scheduleAutosave();
  }

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editorProps: {
      attributes: {
        class: EDITOR_CONTENT_CLASS,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": strings.diary.fields.body,
      },
    },
    onUpdate: () => scheduleAutosave(),
  });

  // ── Case-type taxonomy: Select options + id→name resolution everywhere else ──
  useEffect(() => {
    let cancelled = false;
    lookupsApi
      .listCaseTypes()
      .then(({ caseTypes: options }) => {
        if (!cancelled) setCaseTypes(options);
      })
      .catch(() => {
        // The Select still works with the raw id; the picker is a nicety on top.
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

  // ── Load the diary being edited ───────────────────────────────────────────
  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;

    caseDiariesApi
      .get(id)
      .then(({ caseDiary }) => {
        if (cancelled) return;
        setDiary(caseDiary);
        setHeader(toHeaderForm(caseDiary));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
          setLoadError(strings.editor.notFound);
        } else {
          setLoadError(err instanceof ApiError ? err.message : strings.editor.loadFailed);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew, reloadToken]);

  // ── Push the loaded diary's body into the editor (suppressing `onUpdate`) ──
  useEffect(() => {
    if (!diary || !editor) return;
    const content = isProseMirrorDoc(diary.body) ? diary.body : "";
    editor.commands.setContent(content, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diary?.id, editor]);

  const diaryId = diary?.id;
  const diaryFirNo = diary?.firNo;
  const firDiariesLoading = Boolean(diaryFirNo) && firDiaries === null;
  const similarLoading = Boolean(diaryId) && similar === null;

  // ── Other diaries sharing this FIR (left panel) ───────────────────────────
  useEffect(() => {
    if (!diaryFirNo) return;
    let cancelled = false;
    caseDiariesApi
      .list({ firNo: diaryFirNo, scope: "mine" })
      .then(({ caseDiaries }) => {
        if (!cancelled) setFirDiaries(caseDiaries);
      })
      .catch(() => {
        if (!cancelled) setFirDiaries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [diaryFirNo]);

  // ── Similar past cases (right panel — D7 `SimilarCaseService` seam) ───────
  useEffect(() => {
    if (!diaryId) return;
    let cancelled = false;
    caseDiariesApi
      .similar(diaryId)
      .then(({ caseDiaries }) => {
        if (!cancelled) setSimilar(caseDiaries);
      })
      .catch(() => {
        if (!cancelled) setSimilar([]);
      });
    return () => {
      cancelled = true;
    };
  }, [diaryId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    if (!isHeaderComplete(header)) {
      setCreateError(strings.editor.createFailed);
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const { caseDiary } = await caseDiariesApi.create({ ...buildHeaderPayload(header), body: editor.getJSON() });
      navigate(`/diary/${caseDiary.id}`, { replace: true });
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setCreating(false);
    }
  }

  function handleNewDiaryForFir() {
    if (!diary) return;
    const nextPrefill: Partial<HeaderFormState> = {
      firNo: diary.firNo,
      policeStation: diary.policeStation,
      firRegistrationDateTime: diary.firRegistrationDateTime,
      caseTypeId: diary.caseTypeId,
    };
    navigate("/diary/new", { state: { prefill: nextPrefill } satisfies PrefillState });
  }

  async function handleDelete() {
    if (!diary) return;
    setDeleting(true);
    try {
      await caseDiariesApi.remove(diary.id);
      toast.success(strings.editor.deleted);
      navigate("/diaries", { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
      setDeleting(false);
    }
  }

  function openVisibilityDialog() {
    setVisibilityOtpSent(false);
    setVisibilityCode("");
    setVisibilityError(null);
    setVisibilityOpen(true);
  }

  async function handleRequestVisibilityOtp() {
    if (!diary) return;
    setVisibilitySubmitting(true);
    setVisibilityError(null);
    try {
      await caseDiariesApi.requestVisibilityOtp(diary.id);
      setVisibilityOtpSent(true);
      toast.success(strings.editor.otpSent);
    } catch (err) {
      setVisibilityError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setVisibilitySubmitting(false);
    }
  }

  async function handleConfirmVisibility(event: FormEvent) {
    event.preventDefault();
    if (!diary) return;
    setVisibilitySubmitting(true);
    setVisibilityError(null);
    try {
      const { caseDiary } = await caseDiariesApi.confirmVisibility(diary.id, visibilityCode.trim());
      setDiary(caseDiary);
      setVisibilityOpen(false);
      toast.success(strings.editor.visibilityChanged);
    } catch (err) {
      setVisibilityError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setVisibilitySubmitting(false);
    }
  }

  if (!isNew && loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-sm text-muted-foreground">{strings.common.loading}</p>
      </div>
    );
  }

  if (!isNew && loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true);
            setLoadError(null);
            setReloadToken((token) => token + 1);
          }}
        >
          {strings.common.retry}
        </Button>
      </div>
    );
  }

  const statusLabel = saveStatusLabel(saveStatus, strings);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-lg font-semibold text-foreground">
            {diary ? `${strings.diary.fields.firNo} - ${diary.firNo}` : strings.editor.newHeading}
          </h1>
          {diary && (
            <>
              <Badge variant={diary.status === "finalized" ? "default" : "secondary"}>
                {diary.status === "finalized" ? strings.diary.finalized : strings.diary.draft}
              </Badge>
              <Badge variant="outline">{diary.visibility === "PUBLIC" ? strings.diary.public : strings.diary.private}</Badge>
              {diary.visibility === "PRIVATE" && diary.ownerId === user?.id && (
                <Button variant="outline" size="sm" onClick={openVisibilityDialog}>
                  {strings.editor.makePublic}
                </Button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {diary && statusLabel && (
            <span className={cn("text-xs", saveStatus === "error" ? "text-destructive" : "text-muted-foreground")}>
              {statusLabel}
              {saveStatus === "saved" && ` · ${formatDateTime(diary.updatedAt)}`}
            </span>
          )}
          {diary && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon className="size-4" />
              {strings.editor.deleteDiary}
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: diaries sharing this FIR */}
        <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border p-4">
          <Button variant="outline" size="sm" className="w-full gap-2" disabled={!diary} onClick={handleNewDiaryForFir}>
            <PlusIcon className="size-4" />
            {strings.editor.newDiaryForFir}
          </Button>

          <p className="text-xs tracking-wide text-muted-foreground uppercase">{strings.editor.firDiariesHeading}</p>

          {!diary && <p className="text-xs text-muted-foreground">{strings.editor.saveBeforeFir}</p>}
          {firDiariesLoading && <p className="text-xs text-muted-foreground">{strings.common.loading}</p>}
          {diary && firDiaries !== null && firDiaries.length === 0 && (
            <p className="text-xs text-muted-foreground">{strings.editor.noFirDiaries}</p>
          )}

          <ul className="space-y-1">
            {(firDiaries ?? []).map((entry) => (
              <li key={entry.id}>
                <Link
                  to={`/diary/${entry.id}`}
                  className={cn(
                    "block rounded-md px-2.5 py-1.5 font-mono text-sm transition-colors",
                    entry.id === diary?.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {entry.caseDiaryNo}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        {/* Centre: header form + Tiptap body */}
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <form
            className="grid grid-cols-1 gap-4 border-b border-border p-6 sm:grid-cols-2"
            onSubmit={isNew ? (event) => void handleCreate(event) : (event) => event.preventDefault()}
          >
            <HeaderField label={strings.diary.fields.caseType} htmlFor="caseTypeId">
              <Select value={header.caseTypeId} onValueChange={(value) => updateHeader("caseTypeId", value)}>
                <SelectTrigger id="caseTypeId" className="w-full">
                  <SelectValue placeholder={strings.editor.selectCaseType} />
                </SelectTrigger>
                <SelectContent>
                  {caseTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </HeaderField>

            <HeaderField label={strings.diary.fields.firNo} htmlFor="firNo">
              <Input
                id="firNo"
                value={header.firNo}
                onChange={(e) => updateHeader("firNo", e.target.value)}
                maxLength={64}
                required={isNew}
              />
            </HeaderField>

            <HeaderField label={strings.diary.fields.underSection} htmlFor="underSection">
              <Input
                id="underSection"
                value={header.underSection}
                onChange={(e) => updateHeader("underSection", e.target.value)}
                maxLength={500}
                required={isNew}
              />
            </HeaderField>

            <HeaderField label={strings.diary.fields.policeStation} htmlFor="policeStation">
              <Input
                id="policeStation"
                value={header.policeStation}
                onChange={(e) => updateHeader("policeStation", e.target.value)}
                maxLength={200}
                required={isNew}
              />
            </HeaderField>

            <HeaderField label={strings.diary.fields.incidentDateTime} htmlFor="incidentDateTime">
              <Input
                id="incidentDateTime"
                type="datetime-local"
                value={toDatetimeLocalValue(header.incidentDateTime)}
                onChange={(e) => updateHeader("incidentDateTime", fromDatetimeLocalValue(e.target.value))}
                required={isNew}
              />
            </HeaderField>

            <HeaderField label={strings.diary.fields.firRegistrationDateTime} htmlFor="firRegistrationDateTime">
              <Input
                id="firRegistrationDateTime"
                type="datetime-local"
                value={toDatetimeLocalValue(header.firRegistrationDateTime)}
                onChange={(e) => updateHeader("firRegistrationDateTime", fromDatetimeLocalValue(e.target.value))}
                required={isNew}
              />
            </HeaderField>

            <HeaderField label={strings.diary.fields.placeOfIncidence} htmlFor="placeOfIncidence">
              <Input
                id="placeOfIncidence"
                value={header.placeOfIncidence}
                onChange={(e) => updateHeader("placeOfIncidence", e.target.value)}
                maxLength={500}
                required={isNew}
              />
            </HeaderField>

            <HeaderField label={strings.diary.fields.plaintiffName} htmlFor="plaintiffName">
              <Input
                id="plaintiffName"
                value={header.plaintiffName}
                onChange={(e) => updateHeader("plaintiffName", e.target.value)}
                maxLength={200}
                required={isNew}
              />
            </HeaderField>

            <HeaderField label={strings.diary.fields.accusedName} htmlFor="accusedName">
              <Input
                id="accusedName"
                value={header.accusedName}
                onChange={(e) => updateHeader("accusedName", e.target.value)}
                maxLength={200}
                required={isNew}
              />
            </HeaderField>

            {isNew && (
              <div className="col-span-1 flex flex-col gap-2 sm:col-span-2">
                {createError && <p className="text-sm text-destructive">{createError}</p>}
                <Button type="submit" className="w-fit gap-2" disabled={creating}>
                  {creating ? strings.editor.creating : strings.editor.createDiary}
                </Button>
              </div>
            )}
          </form>

          <div className="flex flex-1 flex-col p-6">
            <Label className="mb-2">{strings.diary.fields.body}</Label>
            <div className="relative flex-1 rounded-md border border-input bg-input/40 p-4">
              {editor?.isEmpty && (
                <p className="pointer-events-none absolute top-4 left-4 font-mono text-sm text-muted-foreground select-none">
                  {strings.editor.bodyPlaceholder}
                </p>
              )}
              <EditorContent editor={editor} />
            </div>
          </div>
        </section>

        {/* Right: similar past cases (real) + AI suggestions (Phase-1 placeholder) */}
        <aside className="flex w-72 shrink-0 flex-col gap-6 overflow-y-auto border-l border-border p-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">{strings.editor.similarCasesHeading}</p>
            <p className="text-xs text-muted-foreground">{strings.editor.similarCasesHint}</p>

            {!diary && <p className="text-xs text-muted-foreground">{strings.editor.notYetSaved}</p>}
            {similarLoading && <p className="text-xs text-muted-foreground">{strings.common.loading}</p>}
            {diary && similar !== null && similar.length === 0 && (
              <p className="text-xs text-muted-foreground">{strings.editor.noSimilarCases}</p>
            )}

            <div className="flex flex-col gap-2">
              {(similar ?? []).map((item) => (
                <Link
                  key={item.id}
                  to={`/diary/${item.id}`}
                  className="rounded-md border border-border bg-card p-3 transition-colors hover:border-primary/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-primary">{item.caseDiaryNo}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {caseTypeNameById.get(item.caseTypeId) ?? item.caseTypeId}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{snippet(extractPlainText(item.body))}</p>
                </Link>
              ))}
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-xs tracking-wide text-muted-foreground uppercase">
              <SparklesIcon className="size-3.5" />
              {strings.editor.aiAssistHeading}
            </p>
            <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              {strings.editor.aiAssistComingSoon}
            </div>
          </div>
        </aside>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{strings.editor.deleteConfirmTitle}</DialogTitle>
            <DialogDescription>{strings.editor.deleteConfirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {strings.common.cancel}
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? strings.common.saving : strings.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={visibilityOpen} onOpenChange={setVisibilityOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{strings.editor.makePublicConfirmTitle}</DialogTitle>
            <DialogDescription>{strings.editor.makePublicConfirmDescription}</DialogDescription>
          </DialogHeader>

          {!visibilityOtpSent ? (
            <>
              {visibilityError && <p className="text-sm text-destructive">{visibilityError}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setVisibilityOpen(false)}>
                  {strings.common.cancel}
                </Button>
                <Button onClick={() => void handleRequestVisibilityOtp()} disabled={visibilitySubmitting}>
                  {visibilitySubmitting ? strings.editor.sendingCode : strings.editor.sendCode}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={(event) => void handleConfirmVisibility(event)} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="visibility-otp">{strings.editor.enterCode}</Label>
                <Input
                  id="visibility-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={visibilityCode}
                  onChange={(e) => setVisibilityCode(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </div>
              {visibilityError && <p className="text-sm text-destructive">{visibilityError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setVisibilityOpen(false)}>
                  {strings.common.cancel}
                </Button>
                <Button type="submit" disabled={visibilitySubmitting || visibilityCode.length !== 6}>
                  {visibilitySubmitting ? strings.editor.confirming : strings.editor.confirm}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
