const WX_RE = /WX\d{8,}/gi;
const SHUNT_RE = /TC-?\d{4}(?:-W\d{1,2}-\d(?:-[A-Z0-9]+)?)?/gi;

function normalizeOcr(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[^A-Z0-9]+/g, "");
}

export function looksLikeUrl(value: string): boolean {
  return /https?:\/\//i.test(value) || /schneider|product.?regist|\.com\//i.test(value);
}

function firstParam(url: URL, names: string[]): string | null {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => v.toUpperCase()))];
}

export type SerialKind = "mccb" | "ml" | "shunt";

export function looksLikeCatalog(value: string): boolean {
  const s = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^C\d{2}[A-Z]/.test(s) || /^NSX/.test(s) || /^LV/.test(s) || /D100E/.test(s);
}

function prepareMccb(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[^A-Z0-9]+/g, "");
}

function asFirst(ch: string): string | null {
  if (/[0-9]/.test(ch)) return ch;
  if (ch === "B") return "8";
  if (ch === "S") return "5";
  return null;
}

function asLetter(ch: string): string | null {
  if (ch === "1" || ch === "|") return "I";
  if (ch === "0") return null;
  if (ch >= "A" && ch <= "Z") return ch;
  return null;
}

function asTailDigit(ch: string): string | null {
  if (/[0-9]/.test(ch)) return ch;
  if (ch === "I" || ch === "|") return "1";
  return null;
}

/** 1 digit + any 3 letters (never O) + 7 digits. */
export function tidyMccb(value: string): string | null {
  const s = prepareMccb(value);
  if (s.length !== 11) return null;
  if (looksLikeCatalog(s)) return null;
  const first = asFirst(s[0]);
  const letters = [asLetter(s[1]), asLetter(s[2]), asLetter(s[3])];
  const tail = [...s.slice(4)].map(asTailDigit);
  if (!first || letters.some((ch) => !ch) || tail.some((ch) => !ch)) return null;
  const mid = letters.join("");
  if (mid === "NSX" || mid === "C10") return null;
  return `${first}${mid}${tail.join("")}`;
}

function mccbScore(serial: string): number {
  const mid = serial.slice(1, 4);
  const tail = serial.slice(4);
  return (
    new Set(mid).size * 10 +
    (tail.startsWith("0") ? 15 : 0) +
    (mid === "III" || mid === "LLL" || mid === "TCH" ? -20 : 0)
  );
}

export function serialCandidates(raw: string, kind: SerialKind): string[] {
  const compact = normalizeOcr(raw);
  const spaced = String(raw || "").toUpperCase();

  if (kind === "ml") {
    const fromWx = [...spaced.matchAll(WX_RE), ...compact.matchAll(/WX\d{8,}/g)].map((m) => m[0]);
    const parsed = parseMicrologicSerial(raw);
    return uniq([...fromWx, ...(parsed ? [parsed] : [])]).filter((v) => /^WX\d{8,}$/.test(v));
  }

  if (kind === "shunt") {
    const hits = [...spaced.matchAll(SHUNT_RE), ...compact.matchAll(/TC-?\d{4}(?:-W\d{1,2}-\d(?:-[A-Z0-9]+)?)?/g)].map(
      (m) => m[0].toUpperCase(),
    );
    return uniq(hits);
  }

  const found: string[] = [];
  const blob = prepareMccb(raw);
  for (let i = 0; i + 11 <= blob.length; i++) {
    const tidy = tidyMccb(blob.slice(i, i + 11));
    if (tidy) found.push(tidy);
  }
  return uniq(found).sort((a, b) => mccbScore(b) - mccbScore(a));
}

export function parseMccbSerial(raw: string): string | null {
  return serialCandidates(raw, "mccb")[0] ?? null;
}

export function parseShuntBatch(raw: string): string | null {
  return serialCandidates(raw, "shunt")[0] ?? null;
}

export function parseKind(raw: string, kind: SerialKind): string | null {
  if (kind === "ml") return parseMicrologicSerial(raw);
  if (kind === "shunt") return parseShuntBatch(raw);
  return parseMccbSerial(raw);
}

export function parseMicrologicSerial(raw: string): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  const wxDirect = trimmed.match(WX_RE);
  if (wxDirect && !looksLikeUrl(trimmed)) {
    return wxDirect[0].toUpperCase();
  }

  if (looksLikeUrl(trimmed)) {
    try {
      const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
      const fromQuery = firstParam(url, [
        "serial",
        "serialNumber",
        "sn",
        "productserial",
        "productSerial",
        "reference",
        "ref",
      ]);
      if (fromQuery) {
        const wx = fromQuery.match(WX_RE);
        return (wx ? wx[0] : fromQuery).toUpperCase();
      }
      const pathWx = url.pathname.match(WX_RE);
      if (pathWx) return pathWx[0].toUpperCase();
      const allWx = trimmed.match(WX_RE);
      if (allWx) return allWx[0].toUpperCase();
    } catch {
      const wx = trimmed.match(WX_RE);
      if (wx) return wx[0].toUpperCase();
    }
    return null;
  }

  const compact = normalizeOcr(trimmed);
  const wx = compact.match(/WX\d{8,}/);
  if (wx) return wx[0];
  return null;
}
