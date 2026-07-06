import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ClipboardListIcon, MinusIcon, PlusIcon, Share2Icon, SparklesIcon, Trash2Icon } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { type JSONContent, useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { toast } from "sonner";

import {
  caseDiariesApi,
  type CaseDiary,
  type CaseDiaryHeaderInput,
  type ShareLog,
} from "@/apis/caseDiaries";
import { ApiError } from "@/apis/client";
import { lookupsApi, type LookupOfficer, type LookupOption } from "@/apis/lookups";
import { Badge } from "@/components/ui/badge";
import { VisibilityBadge } from "@/components/VisibilityBadge";
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
import { Textarea } from "@/components/ui/textarea";
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
import { cn, formatDateTime, toDateDisplay } from "@/lib/utils";

const SAVE_DEBOUNCE_MS = 1000;

// Diary Body font-size control (MS-Word-style): a dropdown of common sizes plus
// −/+ steppers. The chosen size applies uniformly to the whole body (set on the
// editor's root element) and is persisted inside the body JSON under `_fontSize`.
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 72;
const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48];
const FONT_SIZE_KEY = "_fontSize";

/** Reads a persisted `_fontSize` off a diary body (if present), else the default. */
function readFontSize(body: unknown): number {
  const raw = (body as Record<string, unknown> | null)?.[FONT_SIZE_KEY];
  return typeof raw === "number" && raw >= MIN_FONT_SIZE && raw <= MAX_FONT_SIZE
    ? raw
    : DEFAULT_FONT_SIZE;
}

/** Merges the current font size into the body JSON so it round-trips with the document. */
function bodyWithFontSize(doc: JSONContent, size: number): Record<string, unknown> {
  return { ...doc, [FONT_SIZE_KEY]: size };
}

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
  cdNo: string;
  /** Stored as YYYY-MM-DD — converted to/from ISO at the input boundary. */
  cdDate: string;
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
  cdNo: "",
  cdDate: "",
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

function toDateValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fromDateValue(value: string): string {
  if (!value) return "";
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!m) return "";
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function toHeaderForm(diary: CaseDiary): HeaderFormState {
  return {
    cdNo: diary.caseDiaryNo,
    cdDate: toDateValue(diary.caseDiaryDate),
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

function buildHeaderPayload(header: HeaderFormState): CaseDiaryHeaderInput & { caseDiaryNo?: string; caseDiaryDate?: string } {
  return {
    caseDiaryNo: header.cdNo.trim() || undefined,
    caseDiaryDate: fromDateValue(header.cdDate) || undefined,
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
  // cdDate is optional; cdNo is auto-filled so we exclude them from the "complete" check
  const { cdDate: _cdDate, cdNo: _cdNo, ...required } = header;
  return Object.values(required).every((value) => value.trim().length > 0);
}

function toDatetimeLocalValue(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string {
  if (!value) return "";
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return "";
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
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

function HeaderField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

interface PrefillState {
  prefill?: Partial<HeaderFormState>;
  prefillFromLatest?: boolean;
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
  const prefillFromLatest = (location.state as PrefillState | null)?.prefillFromLatest ?? false;

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

  const [editorEmpty, setEditorEmpty] = useState(true);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [visibilityOtpSent, setVisibilityOtpSent] = useState(false);
  const [visibilityCode, setVisibilityCode] = useState("");
  const [visibilitySubmitting, setVisibilitySubmitting] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [alreadyPublicOpen, setAlreadyPublicOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLogOpen, setShareLogOpen] = useState(false);

  function persist() {
    if (!diary || !editor) return;
    setSaveStatus("saving");
    caseDiariesApi
      .update(diary.id, { ...buildHeaderPayload(headerRef.current), body: bodyWithFontSize(editor.getJSON(), fontSize) })
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

  /** Set the Diary Body font size (clamped) and persist it via autosave. */
  function applyFontSize(next: number) {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(next)));
    setFontSize(clamped);
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
    onUpdate: ({ editor: e }) => {
      setEditorEmpty(e.isEmpty);
      scheduleAutosave();
    },
  });

  // Apply the chosen font size uniformly to the whole body (inline style on the
  // ProseMirror root overrides the base `text-sm` class).
  //
  // Tiptap v3's `useEditor` (with the default `immediatelyRender: true`) returns
  // the editor instance *before* `EditorContent` mounts its ProseMirror view, so
  // touching `editor.view` too early throws "The editor view is not available…"
  // and trips the app-wide ErrorBoundary. Guard on `editor.isInitialized` and,
  // when the view isn't mounted yet, defer to the `create` event — at which point
  // `editor.view` exists — instead of reaching for `.view.dom` unconditionally.
  useEffect(() => {
    if (!editor) return;

    const applyFontSize = () => {
      if (editor.isDestroyed) return;
      editor.view.dom.style.fontSize = `${fontSize}px`;
    };

    if (editor.isInitialized) {
      applyFontSize();
      return;
    }

    editor.on("create", applyFontSize);
    return () => {
      editor.off("create", applyFontSize);
    };
  }, [editor, fontSize]);

  // ── Auto-fill new diary header from the latest existing diary ───────────
  // Only runs when the left-panel "New diary" button was clicked
  // (it sets prefillFromLatest=true in location.state).
  // Sidebar and HomePage navigate without that flag → blank form.
  useEffect(() => {
    if (!isNew || !prefillFromLatest) return;
    let cancelled = false;
    caseDiariesApi.list({ scope: "mine" })
      .then(({ caseDiaries }) => {
        if (cancelled || caseDiaries.length === 0) return;
        const latest = caseDiaries[0]!;
        setHeader((prev) => ({
          ...prev,
          caseTypeId:             prev.caseTypeId             || latest.caseTypeId,
          firNo:                  prev.firNo                  || latest.firNo,
          underSection:           prev.underSection           || latest.underSection,
          policeStation:          prev.policeStation          || latest.policeStation,
          incidentDateTime:       prev.incidentDateTime       || latest.incidentDateTime,
          firRegistrationDateTime:prev.firRegistrationDateTime|| latest.firRegistrationDateTime,
          placeOfIncidence:       prev.placeOfIncidence       || latest.placeOfIncidence,
          plaintiffName:          prev.plaintiffName          || latest.plaintiffName,
          accusedName:            prev.accusedName            || latest.accusedName,
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, prefillFromLatest]);

  // ── Auto-fill next CD No for new diaries ─────────────────────────────────
  // CD No. is per-FIR: a fresh investigation starts at CD-001, while a new diary
  // for an existing FIR continues its sequence. Re-derive whenever the FIR changes.
  useEffect(() => {
    if (!isNew) return;
    let cancelled = false;
    caseDiariesApi.nextNo(header.firNo)
      .then(({ caseDiaryNo }) => {
        if (!cancelled) setHeader((prev) => ({ ...prev, cdNo: caseDiaryNo }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, header.firNo]);

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
    setEditorEmpty(editor.isEmpty);
    setFontSize(readFontSize(diary.body));
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
      const { caseDiary } = await caseDiariesApi.create({ ...buildHeaderPayload(header), body: bodyWithFontSize(editor.getJSON(), fontSize) });
      navigate(`/diary/${caseDiary.id}`, { replace: true });
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setCreating(false);
    }
  }

  function handleNewDiaryForFir() {
    navigate("/diary/new", { state: { prefillFromLatest: true } satisfies PrefillState });
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
      await caseDiariesApi.requestVisibilityOtp(diary.id, diary.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC");
      setVisibilityOtpSent(true);
      toast.success(strings.editor.otpSent);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setVisibilityOpen(false);
        setAlreadyPublicOpen(true);
      } else {
        setVisibilityError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
      }
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
      const { caseDiary } = await caseDiariesApi.confirmVisibility(
        diary.id,
        diary.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC",
        visibilityCode.trim(),
      );
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
              <VisibilityBadge visibility={diary.visibility} />
              {diary.ownerId === user?.id && (
                <>
                  <Button variant="outline" size="sm" onClick={openVisibilityDialog}>
                    {diary.visibility === "PUBLIC" ? strings.editor.makePrivate : strings.editor.makePublic}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
                    <Share2Icon className="mr-1 size-3.5" />
                    {strings.editor.share}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShareLogOpen(true)}>
                    <ClipboardListIcon className="mr-1 size-3.5" />
                    {strings.editor.shareLog}
                  </Button>
                </>
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
            {[...(firDiaries ?? [])]
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .map((entry, index) => (
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
                    CD-{index + 1} दि0- {toDateDisplay(entry.caseDiaryDate)}
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
            <HeaderField label="CD No." htmlFor="cdNo">
              <Input
                id="cdNo"
                value={header.cdNo}
                onChange={(e) => updateHeader("cdNo", e.target.value)}
                maxLength={32}
                placeholder="Auto"
              />
            </HeaderField>

            <HeaderField label="CD Date" htmlFor="cdDate">
              <Input
                id="cdDate"
                value={header.cdDate}
                onChange={(e) => updateHeader("cdDate", e.target.value)}
                placeholder="dd/mm/yyyy"
                maxLength={10}
                inputMode="numeric"
              />
            </HeaderField>

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
                value={toDatetimeLocalValue(header.incidentDateTime)}
                onChange={(e) => updateHeader("incidentDateTime", fromDatetimeLocalValue(e.target.value))}
                placeholder="dd/mm/yyyy HH:mm"
                maxLength={16}
                inputMode="numeric"
                required={isNew}
              />
            </HeaderField>

            <HeaderField label={strings.diary.fields.firRegistrationDateTime} htmlFor="firRegistrationDateTime">
              <Input
                id="firRegistrationDateTime"
                value={toDatetimeLocalValue(header.firRegistrationDateTime)}
                onChange={(e) => updateHeader("firRegistrationDateTime", fromDatetimeLocalValue(e.target.value))}
                placeholder="dd/mm/yyyy HH:mm"
                maxLength={16}
                inputMode="numeric"
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

            <HeaderField label={strings.diary.fields.accusedName} htmlFor="accusedName" className="sm:col-span-2">
              <Textarea
                id="accusedName"
                value={header.accusedName}
                onChange={(e) => updateHeader("accusedName", e.target.value)}
                maxLength={10000}
                rows={4}
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
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label>{strings.diary.fields.body}</Label>
              {/* MS-Word-style font-size control — applies uniformly to the whole body. */}
              <div className="flex items-center gap-1">
                <span className="mr-1 text-xs text-muted-foreground">{strings.editor.fontSize}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => applyFontSize(fontSize - 1)}
                  disabled={!editor || fontSize <= MIN_FONT_SIZE}
                  aria-label={strings.editor.decreaseFont}
                >
                  <MinusIcon className="size-4" />
                </Button>
                <Select
                  value={String(fontSize)}
                  onValueChange={(v) => applyFontSize(Number(v))}
                  disabled={!editor}
                >
                  <SelectTrigger className="h-8 w-[4.5rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(FONT_SIZE_OPTIONS.includes(fontSize)
                      ? FONT_SIZE_OPTIONS
                      : [...FONT_SIZE_OPTIONS, fontSize].sort((a, b) => a - b)
                    ).map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => applyFontSize(fontSize + 1)}
                  disabled={!editor || fontSize >= MAX_FONT_SIZE}
                  aria-label={strings.editor.increaseFont}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </div>
            </div>
            <div className="relative flex-1 rounded-md border border-input bg-input/40 p-4">
              {editorEmpty && (
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

      {/* Info dialog — all CDs for this FIR already at the requested visibility */}
      <Dialog open={alreadyPublicOpen} onOpenChange={setAlreadyPublicOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>सूचना</DialogTitle>
            <DialogDescription>
              {diary && `मुकदमा नं. ${diary.firNo} की सभी केस डायरी पहले से ही ${diary.visibility === "PUBLIC" ? "Private" : "Public"} हैं।`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setAlreadyPublicOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={visibilityOpen} onOpenChange={setVisibilityOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {diary?.visibility === "PUBLIC" ? strings.editor.makePrivateConfirmTitle : strings.editor.makePublicConfirmTitle}
            </DialogTitle>
            <DialogDescription>
              {diary && `मुकदमा नं. ${diary.firNo} की सारी केस डायरी ${diary.visibility === "PUBLIC" ? "Private" : "Public"} हो जाएंगी।`}
            </DialogDescription>
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

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          {shareOpen && diary && (
            <ShareDiaryDialog
              diaryId={diary.id}
              onClose={() => setShareOpen(false)}
              onShared={() => setShareOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={shareLogOpen} onOpenChange={setShareLogOpen}>
        <DialogContent>
          {shareLogOpen && diary && <ShareLogDialog diaryId={diary.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Read-only popup: every share grant across this मुकदमा — CD, recipient officer, and timestamp. */
function ShareLogDialog({ diaryId }: { diaryId: string }) {
  const strings = useStrings();
  const [log, setLog] = useState<ShareLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    caseDiariesApi
      .getShareLog(diaryId)
      .then((result) => { if (!cancelled) setLog(result); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong); });
    return () => { cancelled = true; };
  }, [diaryId, strings.common.somethingWentWrong]);

  return (
    // Terminal-style share log: monospace, green (--primary) text throughout.
    <div className="flex flex-col gap-4 font-mono text-primary">
      <DialogHeader>
        <DialogTitle className="text-primary">
          {strings.editor.shareLog}
          {log ? ` — मुकदमा नं. ${log.firNo}` : ""}
        </DialogTitle>
        {log && (
          <DialogDescription className="text-primary/80">
            {log.recipientCount} {strings.editor.shareLogOfficersWord} · {log.sharedDiaryCount} {strings.editor.shareLogDiariesWord}
          </DialogDescription>
        )}
      </DialogHeader>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && !log && <p className="text-sm text-primary/70">{strings.common.loading}</p>}
      {log && log.entries.length === 0 && <p className="text-sm text-primary/70">{strings.editor.shareLogEmpty}</p>}

      {log && log.entries.length > 0 && (
        <div className="max-h-80 overflow-y-auto rounded-md border border-primary/30">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary text-xs text-primary/70">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{strings.editor.shareLogColOfficer}</th>
                <th className="px-3 py-2 text-left font-medium">{strings.editor.shareLogColDiary}</th>
                <th className="px-3 py-2 text-left font-medium">{strings.editor.shareLogColWhen}</th>
              </tr>
            </thead>
            <tbody>
              {log.entries.map((entry) => (
                <tr key={`${entry.diaryId}-${entry.recipientId}`} className="border-t border-primary/20">
                  <td className="px-3 py-2">
                    <div className="font-medium text-primary">{entry.recipientName}</div>
                    <div className="text-xs text-primary/70">
                      {entry.recipientId}
                      {entry.recipientDesignation ? ` · ${entry.recipientDesignation}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-primary">{entry.caseDiaryNo}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-primary/70">{formatDateTime(entry.sharedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface ShareDiaryDialogProps {
  diaryId: string;
  onClose: () => void;
  onShared: () => void;
}

/**
 * Share flow: type-ahead over the active-officer directory to pick a recipient,
 * then the owner confirms with an OTP (sent to their registered contact) before
 * a READ_ONLY grant is created (mirrors the visibility step-up).
 */
function ShareDiaryDialog({ diaryId, onClose, onShared }: ShareDiaryDialogProps) {
  const strings = useStrings();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [officers, setOfficers] = useState<LookupOfficer[]>([]);
  const [selected, setSelected] = useState<LookupOfficer | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    lookupsApi
      .searchOfficers(debounced)
      .then(({ officers: results }) => { if (!cancelled) setOfficers(results); })
      .catch(() => { if (!cancelled) setOfficers([]); });
    return () => { cancelled = true; };
  }, [debounced]);

  async function sendCode() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await caseDiariesApi.requestShareOtp(diaryId, selected.id);
      setOtpSent(true);
      toast.success(strings.editor.otpSent);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await caseDiariesApi.confirmShare(diaryId, selected.id, code.trim());
      toast.success(strings.editor.shared);
      onShared();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : strings.common.somethingWentWrong);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{strings.editor.shareTitle}</DialogTitle>
        <DialogDescription>{strings.editor.shareDescription}</DialogDescription>
      </DialogHeader>

      {!otpSent ? (
        <>
          {selected ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary px-3 py-2">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">{strings.editor.shareSelectedLabel}</span>
                <span className="text-sm font-medium text-foreground">
                  {selected.name} · {selected.id}
                  {selected.designation ? ` · ${selected.designation}` : ""}
                </span>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
                {strings.common.cancel}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="share-officer-search">{strings.editor.shareRecipientLabel}</Label>
              <Input
                id="share-officer-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={strings.editor.shareSearchPlaceholder}
                autoFocus
              />
              <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                {officers.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">{strings.editor.shareNoOfficers}</p>
                ) : (
                  officers.map((officer) => (
                    <button
                      key={officer.id}
                      type="button"
                      onClick={() => setSelected(officer)}
                      className="flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-secondary"
                    >
                      <span className="text-sm font-medium text-foreground">{officer.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {officer.id}
                        {officer.designation ? ` · ${officer.designation}` : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{strings.common.cancel}</Button>
            <Button type="button" onClick={() => void sendCode()} disabled={!selected || submitting}>
              {submitting ? strings.editor.sendingCode : strings.editor.shareSend}
            </Button>
          </DialogFooter>
        </>
      ) : (
        <form onSubmit={(e) => void confirm(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="share-otp">{strings.editor.enterCode}</Label>
            <Input
              id="share-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{strings.common.cancel}</Button>
            <Button type="submit" disabled={submitting || code.length !== 6}>
              {submitting ? strings.editor.confirming : strings.editor.confirm}
            </Button>
          </DialogFooter>
        </form>
      )}
    </div>
  );
}
