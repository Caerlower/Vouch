import {
  decodeToken,
  verifyReferralEnvelope,
} from "./referral-token.js";
import type {
  AccountHistoryEntry,
  AccountRecord,
  ReferralEnvelope,
  ReferralPayload,
  SettlementMeta,
} from "./types.js";

/**
 * Per-address settlement ledger + signed-referral nonce store.
 *
 * { [address]: { paymentsMade, referralEarnings, history: [...] } }
 *
 * Referral tokens are single-use: nonce consumed on successful settlement.
 */

const accounts: Record<string, AccountRecord> = Object.create(null);
const usedNonces = new Set<string>();
/** Plain-mode: nonce burned when discounted 402 is issued; settle claims this. */
const challengeReferrals = new Map<
  string,
  { referrer: string; sellerId: string }
>();

function ensure(address: string): AccountRecord {
  if (!accounts[address]) {
    accounts[address] = {
      paymentsMade: 0,
      referralEarnings: 0,
      history: [],
    };
  }
  return accounts[address];
}

function roundUsdc(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function hasPaymentHistory(address: string | null | undefined): boolean {
  if (!address) return false;
  const acct = accounts[address];
  return Boolean(acct && acct.paymentsMade >= 1);
}

export function isNonceUsed(nonce: string | null | undefined): boolean {
  return Boolean(nonce && usedNonces.has(nonce));
}

/** Mark nonce consumed. Returns false if already used. */
export function tryConsumeNonce(nonce: unknown): boolean {
  if (!nonce || typeof nonce !== "string") return false;
  if (usedNonces.has(nonce)) return false;
  usedNonces.add(nonce);
  return true;
}

/**
 * Plain-mode: burn nonce when issuing a discounted 402 challenge so only one
 * discounted payment can be made per referral token.
 */
export function consumeNonceForChallenge(
  nonce: string,
  referrer: string,
  sellerId: string,
): boolean {
  if (!tryConsumeNonce(nonce)) return false;
  challengeReferrals.set(nonce, { referrer, sellerId });
  return true;
}

/** Claim plain-mode challenge referral at settle (one-shot). */
export function takeChallengeReferral(
  nonce: string | null | undefined,
): { referrer: string; sellerId: string } | null {
  if (!nonce) return null;
  const pending = challengeReferrals.get(nonce) || null;
  if (pending) challengeReferrals.delete(nonce);
  return pending;
}

export type SignatureCheckResult =
  | { ok: false; reason: string; message?: string }
  | {
      ok: true;
      payload: ReferralPayload;
      envelope: ReferralEnvelope;
    };

/**
 * Cryptographic + expiry + unused-nonce check (does not consume).
 */
export async function isValidSignature(
  token: string,
): Promise<SignatureCheckResult> {
  const decoded = decodeToken(token);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason };
  }

  const verified = await verifyReferralEnvelope(decoded.envelope);
  if (!verified.ok) {
    return { ok: false, reason: verified.reason, message: verified.message };
  }

  const { payload } = verified;
  if (!payload.nonce) {
    return { ok: false, reason: "missing_nonce" };
  }
  if (usedNonces.has(payload.nonce)) {
    return { ok: false, reason: "nonce_reused" };
  }

  return { ok: true, payload, envelope: decoded.envelope };
}

export type ReferrerGateResult =
  | {
      ok: false;
      reason: string;
      message?: string;
      payload?: ReferralPayload;
    }
  | { ok: true; payload: ReferralPayload; referrer: string };

/**
 * Full referral gate: valid ARC-60 signature, unused nonce, not expired,
 * and referrer address has ≥1 prior settlement.
 */
export async function isValidReferrer(
  token: string,
): Promise<ReferrerGateResult> {
  const sig = await isValidSignature(token);
  if (!sig.ok) {
    return { ok: false, reason: sig.reason, message: sig.message };
  }

  const { payload } = sig;
  if (!hasPaymentHistory(payload.referrer)) {
    return {
      ok: false,
      reason: "no_payment_history",
      payload,
    };
  }

  return { ok: true, payload, referrer: payload.referrer };
}

/**
 * Log a successful payment. If referralAddress is set (decoded referrer),
 * credit commission. Call tryConsumeNonce separately when applying a token.
 */
export function recordSettlement(
  payerAddress: string,
  amount: number | string,
  referralAddress: string | null = null,
  meta: SettlementMeta = {},
) {
  const paid = roundUsdc(Number(amount) || 0);
  const commissionPercent = Number(
    meta.commissionPercent ??
      process.env.REFERRAL_COMMISSION_PERCENT ??
      8,
  );

  const payer = ensure(payerAddress);
  payer.paymentsMade += 1;
  const payerEntry: AccountHistoryEntry = {
    type: "payment",
    amount: paid,
    referral: referralAddress || null,
    timestamp: new Date().toISOString(),
    txId: meta.txId || null,
    sellerId: meta.sellerId || null,
  };
  payer.history.push(payerEntry);

  let commission: { address: string; amount: number } | null = null;
  if (
    referralAddress &&
    referralAddress !== payerAddress &&
    hasPaymentHistory(referralAddress)
  ) {
    // After payer++ above, referrer history is unchanged — check referrer acct directly
    const credit = roundUsdc(paid * (commissionPercent / 100));
    if (credit > 0) {
      const referrer = ensure(referralAddress);
      // hasPaymentHistory was true before this call for the referrer;
      // re-check referrer's own paymentsMade (not affected by payer increment)
      if (referrer.paymentsMade >= 1) {
        referrer.referralEarnings = roundUsdc(
          referrer.referralEarnings + credit,
        );
        referrer.history.push({
          type: "commission",
          amount: credit,
          fromPayer: payerAddress,
          timestamp: new Date().toISOString(),
        });
        commission = { address: referralAddress, amount: credit };
      }
    }
  }

  return { payerEntry, commission };
}

export function seedPayment(
  address: string,
  amount: number | null = null,
) {
  const paid = amount ?? Number(process.env.BASE_PRICE_USDC || 0.05);
  return recordSettlement(address, paid, null);
}

export function getStats(address: string) {
  const acct = accounts[address];
  if (!acct) {
    return {
      address,
      paymentsMade: 0,
      referralEarnings: 0,
      isValidReferrer: false,
      history: [] as AccountHistoryEntry[],
    };
  }
  return {
    address,
    paymentsMade: acct.paymentsMade,
    referralEarnings: roundUsdc(acct.referralEarnings),
    isValidReferrer: acct.paymentsMade >= 1,
    history: [...acct.history].slice(-20).reverse(),
  };
}

export function getFullState() {
  const snapshot: Record<
    string,
    {
      paymentsMade: number;
      referralEarnings: number;
      history: AccountHistoryEntry[];
    }
  > = {};
  for (const [address, acct] of Object.entries(accounts)) {
    snapshot[address] = {
      paymentsMade: acct.paymentsMade,
      referralEarnings: roundUsdc(acct.referralEarnings),
      history: [...acct.history],
    };
  }
  return {
    accounts: snapshot,
    usedNonceCount: usedNonces.size,
  };
}

export function resetStore(): void {
  for (const key of Object.keys(accounts)) delete accounts[key];
  usedNonces.clear();
  challengeReferrals.clear();
}
