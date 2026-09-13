/**
 * One shared passcode for the whole crew, held in a signed cookie.
 *
 * The cookie carries its own expiry and a signature over it, so the server
 * keeps no session state and any tampering fails the check. Web Crypto is used
 * throughout so the same helpers work in Edge middleware and in route
 * handlers.
 */

export const ACCESS_COOKIE = "mccb-access";

/** Long enough that a phone is not asked again mid-job. */
export const SESSION_DAYS = 90;

function passcode(): string {
  return (process.env.APP_PASSCODE || "").trim();
}

/**
 * With no passcode configured the gate is off. Deploying a locked-out app to a
 * crew already mid-shift would be worse than the exposure, so this fails open
 * and reports itself as unprotected instead of guessing.
 */
export function gateEnabled(): boolean {
  return passcode().length > 0;
}

function bytesToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passcode()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

/** Compares without leaking where two strings first differ. */
function equalConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueCookieValue(now = Date.now()): Promise<string> {
  const expiresAt = now + SESSION_DAYS * 86_400_000;
  const payload = `v1.${expiresAt}`;
  return `${payload}.${await sign(payload)}`;
}

export async function cookieValueIsValid(value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [version, expiresAt, signature] = parts;
  if (version !== "v1") return false;
  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) return false;
  return equalConstantTime(signature, await sign(`v1.${expiresAt}`));
}

export async function passcodeMatches(candidate: string): Promise<boolean> {
  const expected = passcode();
  if (!expected) return false;
  // Hash both sides first so the compare is over equal-length digests
  // regardless of what was submitted.
  const digest = async (s: string) =>
    bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return equalConstantTime(await digest(candidate), await digest(expected));
}
