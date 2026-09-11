const WX_RE = /WX\d{8,}/gi;
const MCCB_RE = /\d(?:CEF|CHI|CH|CE)\d{7,11}/gi;
const SHUNT_RE = /TC-?\d{4}(?:-W\d{1,2}-\d(?:-[A-Z0-9]+)?)?/gi;

function normalizeOcr(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[^A-Z0-9-]+/g, "");
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

function tidyMccb(value: string): string | null {
  const s = value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/S$/, "");
  const m = s.match(/^(\d)(CEF|CHI|CH|CE)(\d{7,11})$/);
  if (!m) return null;
  if (m[1] + m[2] === "NSX") return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

export function serialCandidates(raw: string, kind: SerialKind): string[] {
  const compact = normalizeOcr(raw);
  const spaced = String(raw || "").toUpperCase();

  if (kind === "ml") {
    const fromWx = [...spaced.matchAll(WX_RE), ...compact.matchAll(/WX\d{8,}/g)].map((m) => m[0]);
    const fromQr = looksLikeUrl(raw) ? parseMicrologicSerial(raw) : null;
    return uniq([...fromWx, ...(fromQr ? [fromQr] : [])]).filter((v) => /^WX\d{8,}$/.test(v));
  }

  if (kind === "shunt") {
    const hits = [...spaced.matchAll(SHUNT_RE), ...compact.matchAll(/TC-?\d{4}(?:-W\d{1,2}-\d(?:-[A-Z0-9]+)?)?/g)].map(
      (m) => m[0].toUpperCase(),
    );
    return uniq(hits);
  }

  const blobs = [spaced.replace(/[^A-Z0-9]+/g, ""), compact];
  const found: string[] = [];
  for (const blob of blobs) {
    for (const m of blob.matchAll(/\d(?:CEF|CHI|CH|CE)\d{7,11}/g)) {
      const tidy = tidyMccb(m[0]);
      if (tidy) found.push(tidy);
    }
  }
  for (const m of spaced.matchAll(MCCB_RE)) {
    const tidy = tidyMccb(m[0]);
    if (tidy) found.push(tidy);
  }
  return uniq(found);
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

/** Extract a Micrologic serial from a QR payload or OCR. Never save leftover URLs. */
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
