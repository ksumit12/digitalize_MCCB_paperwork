const WX_RE = /WX\d{8,}/i;

function firstParam(url: URL, names: string[]): string | null {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

/** Extract a Micrologic serial from a QR payload. Returns null if we must not auto-save (e.g. leftover URL). */
export function parseMicrologicSerial(raw: string): string | null {
  const trimmed = raw.trim();
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

  if (/^[A-Z0-9-]{6,}$/i.test(trimmed) && !/\s/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return null;
}

export function looksLikeUrl(value: string): boolean {
  return /https?:\/\//i.test(value) || /schneider|product.?regist|\.com\//i.test(value);
}
