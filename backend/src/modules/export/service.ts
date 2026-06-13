import {
  AlignmentType,
  Document,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import PDFDocument from "pdfkit";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { caseDiaries, caseTypes } from "../../db/schema.js";
import type { AuthenticatedUser } from "../../middleware/authGuard.js";
import type { RequestContext } from "../../shared/http.js";
import { extractPlainText } from "../../shared/richText.js";
import { recordAuditEntry } from "../audit/service.js";
import { getCaseDiaryById } from "../case-diary/service.js";
import type { ExportCaseDiaryQuery } from "./dto.js";

type CaseDiaryRow = typeof caseDiaries.$inferSelect;
export type ExportFormat = ExportCaseDiaryQuery["format"];

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/**
 * §6.6: every export must visibly disclaim that this platform is a
 * pre-submission drafting layer, not the CCTNS system of record. The exact
 * wording is mandated, so it is a single constant reused across all three
 * renderers (and asserted on by export tests).
 */
const DISCLAIMER = "DRAFT — Not an official CCTNS record.";

const CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain; charset=utf-8",
};

/** `caseDiaryNo` is officer-editable free text (§6.2) — strip anything that could break a `Content-Disposition` header. */
function sanitizeFilenameSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return cleaned || "case-diary";
}

function formatDateTime(value: Date): string {
  return value.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

interface DiaryFields {
  diary: CaseDiaryRow;
  caseTypeName: string;
}

const FIELD_ROWS = (f: DiaryFields): Array<[string, string]> => [
  ["Case Diary No.", f.diary.caseDiaryNo],
  ["Case Type", f.caseTypeName],
  ["FIR No.", f.diary.firNo],
  ["Under Section", f.diary.underSection],
  ["Police Station", f.diary.policeStation],
  ["Incident Date/Time", formatDateTime(f.diary.incidentDateTime)],
  ["FIR Registration Date/Time", formatDateTime(f.diary.firRegistrationDateTime)],
  ["Place of Incidence", f.diary.placeOfIncidence],
  ["Plaintiff", f.diary.plaintiffName],
  ["Accused", f.diary.accusedName],
  ["Status", f.diary.status],
];

// ── Plain text ─────────────────────────────────────────────────────────────

function renderTxt(fields: DiaryFields): Buffer {
  const banner = `*** ${DISCLAIMER} ***`;
  const lines = [
    banner,
    "",
    "CASE DIARY (DRAFT)",
    "",
    ...FIELD_ROWS(fields).map(([label, value]) => `${label}: ${value}`),
    "",
    "--- Case Diary Body ---",
    extractPlainText(fields.diary.body) || "(empty)",
    "",
    banner,
  ];
  return Buffer.from(lines.join("\n"), "utf-8");
}

// ── PDF (pdfkit) ───────────────────────────────────────────────────────────

function renderPdf(fields: DiaryFields): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Diagonal translucent banner repeated on every page — the "visible watermark" §6.6 requires.
    const drawWatermark = () => {
      doc.save();
      doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.fillColor("red", 0.12);
      doc.fontSize(54);
      doc.text(DISCLAIMER.toUpperCase(), 0, doc.page.height / 2 - 40, {
        width: doc.page.width,
        align: "center",
      });
      doc.restore();
      doc.fillColor("black");
    };
    doc.on("pageAdded", drawWatermark);
    drawWatermark();

    doc.fontSize(16).text("Case Diary (Draft)", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("red").text(DISCLAIMER, { align: "center" });
    doc.fillColor("black");
    doc.moveDown();

    doc.fontSize(11);
    for (const [label, value] of FIELD_ROWS(fields)) {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value);
    }

    doc.moveDown();
    doc.fontSize(13).font("Helvetica-Bold").text("Case Diary Body");
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica").text(extractPlainText(fields.diary.body) || "(empty)");

    doc.end();
  });
}

// ── DOCX (docx) ────────────────────────────────────────────────────────────

function disclaimerParagraph(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: DISCLAIMER, bold: true, color: "C0392B" })],
  });
}

function fieldParagraph(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun({ text: value })],
  });
}

async function renderDocx(fields: DiaryFields): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({ children: [disclaimerParagraph()] }),
        },
        children: [
          disclaimerParagraph(),
          new Paragraph({ text: "" }),
          new Paragraph({
            text: "Case Diary (Draft)",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: "" }),
          ...FIELD_ROWS(fields).map(([label, value]) => fieldParagraph(label, value)),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "Case Diary Body", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: extractPlainText(fields.diary.body) || "(empty)" }),
          new Paragraph({ text: "" }),
          disclaimerParagraph(),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ── Orchestration ──────────────────────────────────────────────────────────

async function loadCaseTypeName(caseTypeId: string): Promise<string> {
  const [caseType] = await db.select({ name: caseTypes.name }).from(caseTypes).where(eq(caseTypes.id, caseTypeId)).limit(1);
  return caseType?.name ?? "Unknown";
}

/**
 * §6.6: server-side generation only, in any of PDF/DOCX/TXT, always carrying
 * the disclaimer, and always audit-logged (actor, format, resource, timestamp).
 * Access is gated by the same `getCaseDiaryById` path as viewing — exporting a
 * diary you cannot view is impossible, and (per that function) the read itself
 * is logged when the caller isn't the owner.
 */
export async function exportCaseDiary(
  user: AuthenticatedUser,
  diaryId: string,
  format: ExportFormat,
  context: RequestContext,
): Promise<ExportResult> {
  const diary = await getCaseDiaryById(user, diaryId, context);
  const caseTypeName = await loadCaseTypeName(diary.caseTypeId);
  const fields: DiaryFields = { diary, caseTypeName };

  let buffer: Buffer;
  switch (format) {
    case "pdf":
      buffer = await renderPdf(fields);
      break;
    case "docx":
      buffer = await renderDocx(fields);
      break;
    case "txt":
      buffer = renderTxt(fields);
      break;
  }

  await recordAuditEntry({
    actorId: user.id,
    action: "case_diary.exported",
    resourceType: "case_diary",
    resourceId: diary.id,
    metadata: { format },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return {
    buffer,
    filename: `${sanitizeFilenameSegment(diary.caseDiaryNo)}.${format}`,
    contentType: CONTENT_TYPES[format],
  };
}
