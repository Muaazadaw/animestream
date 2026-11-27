// Signed cookie values ("payload.expiry.signature", HMAC-SHA256, base64url) using
// Web Crypto, so the same code runs in middleware (edge) and in route handlers.
// Matches lib/auth.ts's session cookie format.

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}

/** Constant-time string comparison. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** "payload.exp.sig" for a payload that has no dots in it. */
export async function signValue(secret: string, payload: string, maxAgeSeconds: number): Promise<string> {
  const value = `${payload}.${Math.floor(Date.now() / 1000) + maxAgeSeconds}`;
  return `${value}.${await hmac(secret, value)}`;
}

/** The payload if the signature is right and it hasn't expired, else null. */
export async function verifyValue(secret: string, raw: string | undefined): Promise<string | null> {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const value = raw.slice(0, i);
  if (!same(raw.slice(i + 1), await hmac(secret, value))) return null;
  const j = value.lastIndexOf(".");
  const exp = Number(value.slice(j + 1));
  return exp * 1000 > Date.now() ? value.slice(0, j) : null;
}

export const SESSION_COOKIE = "as_session";
/** Short-lived proof that an invite was entered; needed to create an account. */
export const GATE_COOKIE = "as_gate";
