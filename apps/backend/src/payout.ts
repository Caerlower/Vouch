/**
 * Settlement bookkeeping after x402 settle.
 *
 * Pay model: client USDC goes directly to the seller's receiving address
 * (dynamic payTo). No hot-wallet forward.
 *
 * Referrer commission is ledgered — stock x402-avm exact scheme verifies a
 * single payTo/amount, so seller+referrer atomic split would need a custom
 * multi-axfer payment group beyond the default client scheme.
 */

export interface SellerLedgerEntry {
  type: "seller_credit";
  amount: number;
  payoutAddress: string | null;
  sellerId: string | null;
  settleTxId: string | null;
  forwardTxId: string | null;
  timestamp: string;
  mode: string;
  note: string;
}

export interface ReferrerLedgerEntry {
  type: "referrer_credit";
  address: string;
  amount: number;
  sellerId: string | null;
  settleTxId: string | null;
  forwardTxId: string | null;
  timestamp: string;
  mode: string;
  note: string;
}

interface SellerLedger {
  payoutAddress: string | null;
  pendingUsdc: number;
  receivedUsdc: number;
  entries: SellerLedgerEntry[];
}

interface ReferrerLedger {
  pendingByAddress: Record<string, number>;
  entries: ReferrerLedgerEntry[];
}

const sellerLedger: SellerLedger = {
  payoutAddress: null,
  pendingUsdc: 0,
  receivedUsdc: 0,
  entries: [],
};

const referrerLedger: ReferrerLedger = {
  pendingByAddress: Object.create(null) as Record<string, number>,
  entries: [],
};

function roundUsdc(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function ensureSellerAddress(): void {
  if (!sellerLedger.payoutAddress) {
    sellerLedger.payoutAddress =
      process.env.SELLER_PAYOUT_ADDRESS || null;
  }
}

export interface SplitOpts {
  payoutAddress?: string | null;
  sellerId?: string | null;
  commissionPercent?: number;
  txId?: string | null;
}

/**
 * @param totalAmount - settled USDC amount (what client paid on-chain)
 * @param referralAddress
 * @param opts
 */
export async function splitAndForward(
  totalAmount: number | string,
  referralAddress: string | null = null,
  opts: SplitOpts = {},
) {
  ensureSellerAddress();
  const total = roundUsdc(Number(totalAmount) || 0);
  const commissionPercent = Number(
    opts.commissionPercent ??
      process.env.REFERRAL_COMMISSION_PERCENT ??
      8,
  );
  const payoutAddress =
    opts.payoutAddress || sellerLedger.payoutAddress || null;
  if (opts.payoutAddress) {
    sellerLedger.payoutAddress = opts.payoutAddress;
  }

  const referrerShare =
    referralAddress && total > 0
      ? roundUsdc(total * (commissionPercent / 100))
      : 0;
  // On-chain: seller received `total` at payoutAddress via x402 settle.
  // Commission is an off-chain / ledger obligation until multi-axfer lands.
  const sellerReceived = total;

  sellerLedger.receivedUsdc = roundUsdc(
    sellerLedger.receivedUsdc + sellerReceived,
  );

  const sellerEntry: SellerLedgerEntry = {
    type: "seller_credit",
    amount: sellerReceived,
    payoutAddress,
    sellerId: opts.sellerId || null,
    settleTxId: opts.txId || null,
    forwardTxId: opts.txId || null, // same txn — paid directly
    timestamp: new Date().toISOString(),
    mode: "direct",
    note: "USDC received in x402 settle (payTo = seller)",
  };
  sellerLedger.entries.push(sellerEntry);

  let referrerEntry: ReferrerLedgerEntry | null = null;
  if (referralAddress && referrerShare > 0) {
    referrerLedger.pendingByAddress[referralAddress] = roundUsdc(
      (referrerLedger.pendingByAddress[referralAddress] || 0) +
        referrerShare,
    );
    referrerEntry = {
      type: "referrer_credit",
      address: referralAddress,
      amount: referrerShare,
      sellerId: opts.sellerId || null,
      settleTxId: opts.txId || null,
      forwardTxId: null,
      timestamp: new Date().toISOString(),
      mode: "ledger",
      note: "Commission ledgered — not a second on-chain hop from Vouch",
    };
    referrerLedger.entries.push(referrerEntry);
  }

  console.log(
    `[vouch:payout] direct seller=${sellerReceived}→${payoutAddress || "?"} settleTx=${opts.txId || "n/a"} referrer=${referrerShare} (${referralAddress || "none"}) [ledger]`,
  );

  return {
    sellerShare: sellerReceived,
    referrerShare,
    referralAddress: referralAddress || null,
    mode: "direct" as const,
    sellerEntry,
    referrerEntry,
    sellerForward: opts.txId
      ? { ok: true as const, txId: opts.txId, amountUsdc: sellerReceived }
      : null,
    referrerForward: null,
  };
}

export function getSellerLedger() {
  ensureSellerAddress();
  return {
    payoutAddress: sellerLedger.payoutAddress,
    pendingUsdc: roundUsdc(sellerLedger.pendingUsdc),
    forwardedUsdc: roundUsdc(sellerLedger.receivedUsdc),
    receivedUsdc: roundUsdc(sellerLedger.receivedUsdc),
    entries: [...sellerLedger.entries].slice(-50).reverse(),
  };
}

export function getReferrerLedger() {
  return {
    pendingByAddress: { ...referrerLedger.pendingByAddress },
    entries: [...referrerLedger.entries].slice(-50).reverse(),
  };
}

export function getPayoutSnapshot() {
  return {
    seller: getSellerLedger(),
    referrers: getReferrerLedger(),
    payModel: "direct_to_seller" as const,
  };
}
