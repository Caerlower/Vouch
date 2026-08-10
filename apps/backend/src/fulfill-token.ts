/**
 * Short-lived HMAC attestation that Vouch settled payment for a seller resource.
 * Native upstreams must verify this instead of trusting a forgeable boolean header.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_MS = 120_000;
const PLACEHOLDER = "vouch-dev-fulfill-secret-change-me";

function fulfillSecret(): string {
  const secret = process.env.VOUCH_FULFILL_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "VOUCH_FULFILL_SECRET is required (shared HMAC with native sellers).",
    );
  }
  if (secret === PLACEHOLDER) {
    throw new Error(
      "VOUCH_FULFILL_SECRET must not use the published placeholder value.",
    );
  }
  return secret;
}

export function mintFulfillToken(
  sellerId: string,
  ttlMs = DEFAULT_TTL_MS,
): string {
  const exp = Date.now() + ttlMs;
  const payload = `${sellerId}.${exp}`;
  const sig = createHmac("sha256", fulfillSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export type FulfillVerify =
  | { ok: true; sellerId: string }
  | { ok: false; reason: string };

export function verifyFulfillToken(
  token: string | null | undefined,
  expectedSellerId?: string | null,
): FulfillVerify {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "missing_token" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "malformed" };
  }
  const [sellerId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!sellerId || !Number.isFinite(exp)) {
    return { ok: false, reason: "malformed" };
  }
  if (exp < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (expectedSellerId && sellerId !== expectedSellerId) {
    return { ok: false, reason: "seller_mismatch" };
  }
  let expected: string;
  try {
    expected = createHmac("sha256", fulfillSecret())
      .update(`${sellerId}.${expRaw}`)
      .digest("base64url");
  } catch {
    return { ok: false, reason: "secret_unconfigured" };
  }
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "bad_signature" };
    }
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true, sellerId };
}

export function fulfillAuthConfigured(): boolean {
  try {
    fulfillSecret();
    return true;
  } catch {
    return false;
  }
}

/** Call once at process boot so misconfig fails fast. */
export function assertFulfillSecretConfigured(): void {
  fulfillSecret();
}
