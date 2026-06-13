/**
 * Indian mobile numbers: 10 national digits, first digit 6–9 (TRAI numbering plan).
 * We normalize to E.164 (+91XXXXXXXXXX) and reject anything that doesn't cleanly
 * resolve to that shape — never silently truncate or "correct" the input (per spec).
 */
const NATIONAL_NUMBER_PATTERN = /^[6-9]\d{9}$/;

export function normalizeIndianMobile(raw: string): string | null {
  const trimmed = raw.trim().replace(/[\s-]/g, "");
  let national: string;

  if (trimmed.startsWith("+91")) {
    national = trimmed.slice(3);
  } else if (trimmed.startsWith("91") && trimmed.length === 12) {
    national = trimmed.slice(2);
  } else if (trimmed.startsWith("0") && trimmed.length === 11) {
    national = trimmed.slice(1);
  } else {
    national = trimmed;
  }

  if (!NATIONAL_NUMBER_PATTERN.test(national)) return null;
  return `+91${national}`;
}
