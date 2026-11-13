import { describe, expect, it } from "vitest";
import { signPayload, timingSafeEqual, verifySignature } from "@/convex/lib/signature";

const SECRET = "test-secret-please-rotate";
const NOW = 1_780_000_000; // fixed unix seconds
const BODY = JSON.stringify({ loanId: "abc", status: "approved" });

async function signedHeaders(body = BODY, at = NOW, secret = SECRET) {
  const { signature, timestamp } = await signPayload(secret, body, at);
  return { signatureHeader: signature, timestampHeader: timestamp };
}

describe("signPayload", () => {
  it("produces a sha256= prefixed 64-char hex digest and integer timestamp", async () => {
    const { signature, timestamp } = await signPayload(SECRET, BODY, NOW + 0.9);
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(timestamp).toBe(String(NOW));
  });

  it("matches a known HMAC-SHA256 vector (same output n8n's Node crypto produces)", async () => {
    // printf '%s' '1700000000.{}' | openssl dgst -sha256 -hmac 'key'
    const { signature } = await signPayload("key", "{}", 1_700_000_000);
    const node = await import("node:crypto");
    const expected = node.createHmac("sha256", "key").update("1700000000.{}").digest("hex");
    expect(signature).toBe(`sha256=${expected}`);
  });
});

describe("verifySignature", () => {
  it("accepts a valid, fresh signature", async () => {
    const headers = await signedHeaders();
    await expect(verifySignature({ secret: SECRET, rawBody: BODY, nowSeconds: NOW + 10, ...headers })).resolves.toEqual({ ok: true });
  });

  it("rejects a tampered body", async () => {
    const headers = await signedHeaders();
    const result = await verifySignature({ secret: SECRET, rawBody: BODY.replace("approved", "returned"), nowSeconds: NOW, ...headers });
    expect(result).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects a signature made with a different secret", async () => {
    const headers = await signedHeaders(BODY, NOW, "other-secret");
    expect(await verifySignature({ secret: SECRET, rawBody: BODY, nowSeconds: NOW, ...headers })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects a replayed request outside the 5 minute window (both directions)", async () => {
    const headers = await signedHeaders();
    expect(await verifySignature({ secret: SECRET, rawBody: BODY, nowSeconds: NOW + 301, ...headers })).toEqual({ ok: false, reason: "STALE_TIMESTAMP" });
    expect(await verifySignature({ secret: SECRET, rawBody: BODY, nowSeconds: NOW - 301, ...headers })).toEqual({ ok: false, reason: "STALE_TIMESTAMP" });
    expect((await verifySignature({ secret: SECRET, rawBody: BODY, nowSeconds: NOW + 300, ...headers })).ok).toBe(true);
  });

  it("rejects swapping in a fresh timestamp on an old signature", async () => {
    const { signatureHeader } = await signedHeaders(BODY, NOW - 3600);
    const result = await verifySignature({ secret: SECRET, rawBody: BODY, nowSeconds: NOW, signatureHeader, timestampHeader: String(NOW) });
    expect(result).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("fails closed when the secret is missing", async () => {
    const headers = await signedHeaders();
    expect(await verifySignature({ secret: undefined, rawBody: BODY, nowSeconds: NOW, ...headers })).toEqual({ ok: false, reason: "NO_SECRET" });
    expect(await verifySignature({ secret: "", rawBody: BODY, nowSeconds: NOW, ...headers })).toEqual({ ok: false, reason: "NO_SECRET" });
  });

  it("rejects missing or malformed headers", async () => {
    const base = { secret: SECRET, rawBody: BODY, nowSeconds: NOW };
    expect(await verifySignature({ ...base, signatureHeader: null, timestampHeader: String(NOW) })).toEqual({ ok: false, reason: "MISSING_HEADERS" });
    expect(await verifySignature({ ...base, signatureHeader: "sha256=00", timestampHeader: null })).toEqual({ ok: false, reason: "MISSING_HEADERS" });
    expect(await verifySignature({ ...base, signatureHeader: "sha256=00", timestampHeader: "12.5" })).toEqual({ ok: false, reason: "MALFORMED_TIMESTAMP" });
    expect(await verifySignature({ ...base, signatureHeader: "sha256=00", timestampHeader: "-5" })).toEqual({ ok: false, reason: "MALFORMED_TIMESTAMP" });
  });
});

describe("timingSafeEqual", () => {
  it("compares equal and unequal strings correctly, including different lengths", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
    expect(timingSafeEqual("", "a")).toBe(false);
  });
});
