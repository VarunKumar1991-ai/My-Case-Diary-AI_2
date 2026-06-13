/**
 * `CaseDiary.body` stores a Tiptap/ProseMirror JSON document (§6.2). Both the
 * export pipeline (rendering to PDF/DOCX/TXT) and the Phase-1 keyword-overlap
 * `SuggestionService` (D7) need the document's plain-text content, so this
 * walk lives here rather than being duplicated in each module.
 */
export function extractPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const record = node as { text?: unknown; content?: unknown };
  const parts: string[] = [];

  if (typeof record.text === "string") parts.push(record.text);
  if (Array.isArray(record.content)) {
    for (const child of record.content) parts.push(extractPlainText(child));
  }

  return parts.join(" ");
}
