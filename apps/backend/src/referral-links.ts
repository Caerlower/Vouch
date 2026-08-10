import { randomBytes } from "node:crypto";
import type { ReferralPayload, ShortLink } from "./types.js";

/**
 * Short referral codes → full signed token.
 * Public URL becomes /go/:code instead of a giant query string.
 */
const links: Record<string, ShortLink> = Object.create(null);

function makeCode(len = 8): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export interface CreateShortLinkInput {
  token: string;
  sellerId?: string;
  referrer?: string | null;
  payload?: ReferralPayload | null;
}

export function createShortLink({
  token,
  sellerId,
  referrer,
  payload,
}: CreateShortLinkInput): ShortLink {
  let code = makeCode();
  while (links[code]) code = makeCode();
  const entry: ShortLink = {
    code,
    token,
    sellerId: sellerId || "acme-default",
    referrer: referrer || payload?.referrer || null,
    payload: payload || null,
    createdAt: new Date().toISOString(),
    uses: 0,
  };
  links[code] = entry;
  return entry;
}

export function getShortLink(code: string | null | undefined): ShortLink | null {
  if (!code) return null;
  return links[String(code).toLowerCase()] || links[code] || null;
}

export type ResolveReferralResult =
  | { kind: "none"; token: null; code: null }
  | { kind: "short"; token: string; code: string; link: ShortLink }
  | { kind: "token"; token: string; code: null };

/** Resolve either a short code or a raw token string (does not mutate use count). */
export function resolveReferralParam(
  value: string | null | undefined,
): ResolveReferralResult {
  if (!value) return { kind: "none", token: null, code: null };
  // Short codes are short alphanumeric (not base64 tokens)
  if (/^[a-z0-9]{6,12}$/i.test(value)) {
    const link = getShortLink(value);
    if (link) {
      return { kind: "short", token: link.token, code: link.code, link };
    }
  }
  return { kind: "token", token: value, code: null };
}

export function markShortLinkUsed(code: string): ShortLink | null {
  const link = getShortLink(code);
  if (link) link.uses += 1;
  return link;
}

export function listShortLinks(): ShortLink[] {
  return Object.values(links);
}
