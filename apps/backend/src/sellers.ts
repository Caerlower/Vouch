import { randomBytes } from "node:crypto";
import type { ReferralPayload, Seller, SellerDiscovered, SellerMode, PublicSeller } from "./types.js";

/**
 * In-memory seller registry.
 * Modes:
 *  - plain: payment-unaware HTTP API; Vouch adds x402 + referrals
 *  - native: already x402 on Algorand; Vouch discovers payTo and adds referrals
 */

function isPlausibleAlgorandAddress(address: unknown): address is string {
  return (
    typeof address === "string" &&
    address.length === 58 &&
    /^[A-Z2-7]{58}$/.test(address)
  );
}

/** Clamp referral % to [fallback, max]; invalid → fallback. */
function clampPercent(
  value: number | string | undefined,
  fallback: number,
  max: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(max, Math.max(0, n));
}

const sellers: Record<string, Seller> = Object.create(null);

function slugify(input: unknown): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function ensureDefaultSeller(): Seller {
  if (sellers["acme-default"]) return sellers["acme-default"];
  const seller: Seller = {
    id: "acme-default",
    mode: "plain",
    name: "Acme Insights Co.",
    endpointUrl: process.env.SELLER_SERVICE_URL || "http://localhost:4001",
    dataPath: "/data",
    resourceUrl: null,
    // Demo seed only — real sellers set payTo via Register / native 402 probe.
    payoutAddress:
      process.env.SELLER_PAYOUT_ADDRESS || process.env.VOUCH_PAY_TO || "",
    basePriceUsdc: Number(process.env.BASE_PRICE_USDC || 0.05),
    referralDiscountPercent: Number(
      process.env.REFERRAL_DISCOUNT_PERCENT || 20,
    ),
    referralCommissionPercent: Number(
      process.env.REFERRAL_COMMISSION_PERCENT || 8,
    ),
    createdAt: new Date().toISOString(),
  };
  sellers[seller.id] = seller;
  return seller;
}

ensureDefaultSeller();

export function listSellers(): Seller[] {
  return Object.values(sellers);
}

export function getSeller(id: string): Seller | null {
  return sellers[id] || null;
}

/** Public view — never leak upstream HTTP / native resource URLs. */
export function toPublicSeller(seller: Seller | null | undefined): PublicSeller | null {
  if (!seller) return null;
  return {
    id: seller.id,
    name: seller.name,
    mode: seller.mode || "plain",
    payoutAddress: seller.payoutAddress || "",
    basePriceUsdc: seller.basePriceUsdc,
    referralDiscountPercent: seller.referralDiscountPercent,
    referralCommissionPercent: seller.referralCommissionPercent,
    createdAt: seller.createdAt,
  };
}

export function listPublicSellers(): PublicSeller[] {
  return listSellers().map((s) => toPublicSeller(s)!);
}

export interface RegisterSellerInput {
  mode?: SellerMode | string;
  name?: string;
  endpointUrl?: string | null;
  resourceUrl?: string | null;
  payoutAddress?: string | null;
  basePriceUsdc?: number | string;
  referralDiscountPercent?: number | string;
  referralCommissionPercent?: number | string;
  dataPath?: string;
  discovered?: SellerDiscovered | null;
}

export type RegisterSellerResult =
  | { ok: false; error: string; message?: string }
  | { ok: true; seller: Seller };

export function registerSeller({
  mode = "plain",
  name,
  endpointUrl,
  resourceUrl,
  payoutAddress,
  basePriceUsdc,
  referralDiscountPercent,
  referralCommissionPercent,
  dataPath = "/data",
  discovered = null,
}: RegisterSellerInput): RegisterSellerResult {
  const kind: SellerMode = mode === "native" ? "native" : "plain";

  if (kind === "plain") {
    if (!endpointUrl || !String(endpointUrl).trim()) {
      return { ok: false, error: "endpoint_url_required" };
    }
    if (!payoutAddress || !isPlausibleAlgorandAddress(payoutAddress)) {
      return { ok: false, error: "payout_address_invalid" };
    }
  } else {
    const url = resourceUrl || endpointUrl;
    if (!url || !String(url).trim()) {
      return { ok: false, error: "resource_url_required" };
    }
    if (!payoutAddress || !isPlausibleAlgorandAddress(payoutAddress)) {
      return {
        ok: false,
        error: "payout_address_invalid",
        message:
          "Native mode needs a payTo from the 402 probe (or paste one).",
      };
    }
  }

  const base =
    slugify(name) || `seller-${randomBytes(3).toString("hex")}`;
  let id = base;
  let i = 1;
  while (sellers[id]) {
    id = `${base}-${i++}`;
  }

  let endpoint = "";
  let path = "/data";
  let resource: string | null = null;

  if (kind === "native") {
    resource = String(resourceUrl || endpointUrl).trim();
    try {
      const u = new URL(resource);
      endpoint = `${u.protocol}//${u.host}`;
      path = `${u.pathname}${u.search}` || "/";
    } catch {
      endpoint = resource;
      path = "";
    }
  } else {
    endpoint = String(endpointUrl).trim().replace(/\/$/, "");
    path = dataPath.startsWith("/") ? dataPath : `/${dataPath}`;
  }

  const price = Number(basePriceUsdc);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "base_price_invalid" };
  }

  const discount = clampPercent(referralDiscountPercent, 20, 50);
  const commission = clampPercent(referralCommissionPercent, 8, 50);

  const seller: Seller = {
    id,
    mode: kind,
    name: name || id,
    endpointUrl: endpoint,
    dataPath: path,
    resourceUrl: resource,
    payoutAddress: payoutAddress!,
    basePriceUsdc: price,
    referralDiscountPercent: discount,
    referralCommissionPercent: commission,
    discovered: discovered || null,
    createdAt: new Date().toISOString(),
  };

  sellers[id] = seller;
  return { ok: true, seller };
}

export function sellerUpstreamUrl(seller: Seller): string {
  if (seller.mode === "native" && seller.resourceUrl) {
    return seller.resourceUrl;
  }
  return `${seller.endpointUrl}${seller.dataPath || ""}`;
}

export type { Seller, PublicSeller, ReferralPayload, SellerMode };
