/**
 * Canonicalizes an FIR number so the whole portal treats `196/25` and
 * `196/2025` as the same मुकदमा (FIR). An `NNN/YY` or `NNN/YYYY` value is
 * normalized to a 4-digit 21st-century year (`196/25` → `196/2025`), with any
 * whitespace around the slash removed. Values that don't match the pattern are
 * returned trimmed but otherwise untouched — we never guess at unfamiliar formats.
 */
export function normalizeFirNo(firNo: string): string {
  const trimmed = firNo.trim();
  const match = /^(\d+)\s*\/\s*(\d{2}|\d{4})$/.exec(trimmed);
  if (!match) return trimmed;
  const prefix = match[1]!;
  const year = match[2]!;
  const yyyy = year.length === 4 ? year : `20${year}`;
  return `${prefix}/${yyyy}`;
}
