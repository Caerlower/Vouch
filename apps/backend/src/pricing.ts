import {
  ALGORAND_ADDRESS_LENGTH,
  ALGORAND_ADDRESS_REGEX,
} from "@x402-avm/avm";
import { isValidReferrer } from "./referral-store.js";
import { getSeller, ensureDefaultSeller } from "./sellers.js";
import { resolveReferralParam } from "./referral-links.js";
import type { Quote, ReferralPayload, SellerMode, VouchConfig } from "./types.js";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function getConfig(): VouchConfig {
  return {
    vouchPayTo: process.env.VOUCH_PAY_TO || "",
    sellerPayoutAddress: process.env.SELLER_PAYOUT_ADDRESS || "",
    basePriceUsdc: envNumber("BASE_PRICE_USDC", 0.05),
    discountPercent: envNumber("REFERRAL_DISCOUNT_PERCENT", 20),
    commissionPercent: envNumber("REFERRAL_COMMISSION_PERCENT", 8),
    sellerServiceUrl:
      process.env.SELLER_SERVICE_URL || "http://localhost:4001",
  };
}

export function isPlausibleAlgorandAddress(
  address: unknown,
): address is string {
  return (
    typeof address === "string" &&
    address.length === ALGORAND_ADDRESS_LENGTH &&
    ALGORAND_ADDRESS_REGEX.test(address)
  );
}

/** Loose shape for Express req or x402 context. */
export interface ReferralExtractable {
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  params?: Record<string, unknown>;
  get?: (name: string) => string | undefined;
  originalUrl?: string;
  url?: string;
  adapter?: {
    getQueryParam?: (name: string) => string | string[] | undefined;
    getHeader?: (name: string) => string | undefined;
    getPath?: () => string;
    getUrl?: () => string;
  };
}

/** Extract raw referral token string from Express req or x402 context. */
export function extractReferral(
  reqOrContext: ReferralExtractable | null | undefined,
): string | null {
  if (reqOrContext?.query || reqOrContext?.headers) {
    const q = reqOrContext.query?.referral ?? reqOrContext.query?.ref;
    if (typeof q === "string" && q.trim()) return q.trim();
    const h =
      reqOrContext.headers?.["x-referral"] ||
      reqOrContext.headers?.referral ||
      reqOrContext.get?.("x-referral") ||
      reqOrContext.get?.("referral");
    if (typeof h === "string" && h.trim()) return h.trim();
    return null;
  }

  const adapter = reqOrContext?.adapter;
  if (adapter) {
    const q =
      adapter.getQueryParam?.("referral") ?? adapter.getQueryParam?.("ref");
    const fromQuery = Array.isArray(q) ? q[0] : q;
    if (typeof fromQuery === "string" && fromQuery.trim()) {
      return fromQuery.trim();
    }
    const h =
      adapter.getHeader?.("x-referral") || adapter.getHeader?.("referral");
    if (typeof h === "string" && h.trim()) return h.trim();
  }

  return null;
}

export function extractSellerId(
  reqOrContext: ReferralExtractable | null | undefined,
): string | null {
  if (reqOrContext?.params?.sellerId) {
    return String(reqOrContext.params.sellerId);
  }
  if (reqOrContext?.query?.sellerId) return String(reqOrContext.query.sellerId);
  const adapter = reqOrContext?.adapter;
  if (adapter?.getQueryParam) {
    const q = adapter.getQueryParam("sellerId");
    if (typeof q === "string") return q;
    if (Array.isArray(q)) return q[0];
  }
  const path = adapter?.getPath?.() || "";
  const url =
    reqOrContext?.originalUrl ||
    reqOrContext?.url ||
    adapter?.getUrl?.() ||
    path ||
    "";
  const m = String(url).match(/\/r\/([^/?#]+)/);
  return m?.[1] || null;
}

interface BuildArgs {
  price: number;
  discountApplied: boolean;
  discountPercent: number;
  referral: string | null;
  referralReason: string;
  referralEligible?: boolean;
  remitRebateUsdc?: number;
  remitCommissionUsdc?: number;
  commissionPercent: number;
  basePrice: number;
  sellerId: string;
  sellerMode?: SellerMode;
  payload: ReferralPayload | null;
  shortCode?: string | null;
}

/**
 * Resolve price from an optional signed referral token.
 * Invalid tokens never fail the request — they fall back to base price.
 */
export async function getPrice(
  referralParam: string | null | undefined,
  opts: { sellerId?: string | null } = {},
): Promise<Quote> {
  const defaultSeller = ensureDefaultSeller();
  const sellerId = opts.sellerId || defaultSeller.id;
  const seller = getSeller(sellerId) || defaultSeller;

  const basePriceUsdc = seller.basePriceUsdc ?? getConfig().basePriceUsdc;
  const discountPercent =
    seller.referralDiscountPercent ?? getConfig().discountPercent;
  const commissionPercent =
    seller.referralCommissionPercent ?? getConfig().commissionPercent;

  const resolved = resolveReferralParam(referralParam);
  const referralToken = resolved.token;

  const isNative = seller.mode === "native";

  if (!referralToken) {
    return build({
      price: basePriceUsdc,
      discountApplied: false,
      discountPercent: 0,
      referral: null,
      referralReason: referralParam ? "unknown_short_code" : "none",
      referralEligible: false,
      commissionPercent,
      basePrice: basePriceUsdc,
      sellerId: seller.id,
      sellerMode: seller.mode || "plain",
      payload: null,
      shortCode: resolved.code,
    });
  }

  const gate = await isValidReferrer(referralToken);
  if (!gate.ok) {
    return build({
      price: basePriceUsdc,
      discountApplied: false,
      discountPercent: 0,
      referral: null,
      referralReason: gate.reason || "invalid_token",
      referralEligible: false,
      commissionPercent,
      basePrice: basePriceUsdc,
      sellerId: seller.id,
      sellerMode: seller.mode || "plain",
      payload: gate.payload || null,
      shortCode: resolved.code,
    });
  }

  // Token must be issued for this seller (sellerId required on payload)
  if (!gate.payload.sellerId || gate.payload.sellerId !== seller.id) {
    return build({
      price: basePriceUsdc,
      discountApplied: false,
      discountPercent: 0,
      referral: gate.referrer,
      referralReason: gate.payload.sellerId
        ? "seller_mismatch"
        : "missing_seller_id",
      referralEligible: false,
      commissionPercent,
      basePrice: basePriceUsdc,
      sellerId: seller.id,
      sellerMode: seller.mode || "plain",
      payload: gate.payload,
      shortCode: resolved.code,
    });
  }

  const discounted = roundUsdc(basePriceUsdc * (1 - discountPercent / 100));
  const rebateUsdc = roundUsdc(basePriceUsdc - discounted);

  // Native: charge full list price on-chain; rebate via seller escrow remit.
  // Plain: discount applied in the x402 challenge amount.
  if (isNative) {
    return build({
      price: basePriceUsdc,
      discountApplied: false,
      discountPercent,
      referral: gate.referrer,
      referralReason: "valid_remit",
      referralEligible: true,
      remitRebateUsdc: rebateUsdc,
      remitCommissionUsdc: roundUsdc(
        basePriceUsdc * (commissionPercent / 100),
      ),
      commissionPercent,
      basePrice: basePriceUsdc,
      sellerId: seller.id,
      sellerMode: "native",
      payload: gate.payload,
      shortCode: resolved.code,
    });
  }

  return build({
    price: discounted,
    discountApplied: true,
    discountPercent,
    referral: gate.referrer,
    referralReason: "valid",
    referralEligible: true,
    commissionPercent,
    basePrice: basePriceUsdc,
    sellerId: seller.id,
    sellerMode: "plain",
    payload: gate.payload,
    shortCode: resolved.code,
  });
}

function build({
  price,
  discountApplied,
  discountPercent,
  referral,
  referralReason,
  referralEligible = false,
  remitRebateUsdc = 0,
  remitCommissionUsdc = 0,
  commissionPercent,
  basePrice,
  sellerId,
  sellerMode = "plain",
  payload,
  shortCode = null,
}: BuildArgs): Quote {
  const commissionUsdc = discountApplied
    ? roundUsdc(price * (commissionPercent / 100))
    : roundUsdc(remitCommissionUsdc || 0);
  const sellerShareUsdc = discountApplied
    ? roundUsdc(price - commissionUsdc)
    : roundUsdc(price);

  return {
    price,
    priceLabel: toMoneyString(price),
    discountApplied,
    discountPercent: discountPercent || 0,
    referral,
    referralReason,
    referralEligible,
    remitRebateUsdc: roundUsdc(remitRebateUsdc || 0),
    remitCommissionUsdc: roundUsdc(remitCommissionUsdc || 0),
    basePrice,
    commissionPercent,
    commissionUsdc,
    sellerShareUsdc,
    sellerId,
    sellerMode,
    payload,
    shortCode,
  };
}

export function toMoneyString(usdc: number | string): string {
  const n = Number(usdc);
  if (!Number.isFinite(n) || n < 0) return "$0.00";
  return `$${n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
}

export function atomicToUsdc(atomic: bigint | string | number | null | undefined): number {
  const raw =
    typeof atomic === "bigint" ? atomic : BigInt(String(atomic || "0"));
  return Number(raw) / 1e6;
}

function roundUsdc(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
