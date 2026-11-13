/**
 * HMAC-SHA256 request signing shared by both directions of the n8n integration.
 *
 * Signed message:  `${timestamp}.${rawBody}`
 * Headers:         X-LendLoop-Timestamp: <unix seconds>
 *                  X-LendLoop-Signature: sha256=<hex digest>
 *
 * Binding the timestamp into the signed message means an attacker cannot reuse
 * an old signature with a fresh timestamp. Rejecting timestamps outside a
 * 5-minute window bounds how long a captured request could be replayed.
 *
 * Uses Web Crypto only, so the same code runs in Convex's V8 runtime, in Node
 * (tests) and in the browser. No Node `crypto` import.
 */

export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const SIGNATURE_PREFIX = "sha256=";
export const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signPayload(
  secret: string,
  rawBody: string,
  timestampSeconds: number,
): Promise<{ signature: string; timestamp: string }> {
  const timestamp = String(Math.floor(timestampSeconds));
  const digest = await hmacHex(secret, `${timestamp}.${rawBody}`);
  return { signature: `${SIGNATURE_PREFIX}${digest}`, timestamp };
}

/**
 * Constant-time string comparison. A normal `===` returns as soon as a byte
 * differs, which leaks (via timing) how many leading characters were correct.
 * We always walk the full length and fold differences with XOR/OR.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  // Length is not secret here (always 71 chars for a valid header), but we
  // still compare over the longer length so the loop time does not depend on it.
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "MISSING_HEADERS" | "MALFORMED_TIMESTAMP" | "STALE_TIMESTAMP" | "BAD_SIGNATURE" | "NO_SECRET" };

export async function verifySignature(input: {
  secret: string | undefined;
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  nowSeconds: number;
  toleranceSeconds?: number;
}): Promise<VerifyResult> {
  const { secret, rawBody, signatureHeader, timestampHeader, nowSeconds } = input;
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  // Fail closed: a missing secret must never mean "accept everything".
  if (!secret) return { ok: false, reason: "NO_SECRET" };
  if (!signatureHeader || !timestampHeader) return { ok: false, reason: "MISSING_HEADERS" };
  if (!/^\d{1,12}$/.test(timestampHeader)) return { ok: false, reason: "MALFORMED_TIMESTAMP" };

  const timestamp = Number(timestampHeader);
  if (Math.abs(nowSeconds - timestamp) > tolerance) return { ok: false, reason: "STALE_TIMESTAMP" };

  const expected = `${SIGNATURE_PREFIX}${await hmacHex(secret, `${timestampHeader}.${rawBody}`)}`;
  return timingSafeEqual(expected, signatureHeader) ? { ok: true } : { ok: false, reason: "BAD_SIGNATURE" };
}
