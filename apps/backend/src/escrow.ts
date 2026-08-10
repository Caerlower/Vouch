/**
 * Seller promo escrow — backed by on-chain VouchEscrow Application.
 *
 * Balances & remits execute as real Testnet USDC ASA transfers via the app.
 * Local arrays keep a short activity log for the API/UI (not the source of truth).
 */

import { randomBytes } from "node:crypto";
import type {
  EscrowDepositEntry,
  EscrowRemitEntry,
  EscrowSnapshot,
  EscrowVault,
  EscrowWithdrawEntry,
} from "./types.js";
import {
  escrowConfigured,
  getAppAddress,
  getEscrowAppId,
  prepareDepositGroup,
  readSellerBalanceUsdc,
  remitOnChain,
  withdrawOnChain,
  isSettleRemitted,
  registerOwnerOnChain,
  readSellerOwner,
  USDC_ASA,
} from "./escrow-chain.js";

const vaults: Record<string, EscrowVault> = Object.create(null);
const remitBySettle: Record<string, EscrowRemitEntry> = Object.create(null);

function roundUsdc(n: number | string): number {
  return Math.round(Number(n) * 1e6) / 1e6;
}

function ensure(sellerId: string): EscrowVault {
  if (!vaults[sellerId]) {
    vaults[sellerId] = {
      sellerId,
      balanceUsdc: 0,
      deposits: [],
      remits: [],
      withdrawals: [],
    };
  }
  return vaults[sellerId];
}

export function getEscrowVaultAddress(): string | null {
  return getAppAddress() || process.env.VOUCH_ESCROW_ADDRESS || null;
}

export function getEscrowStatus() {
  const appId = getEscrowAppId();
  return {
    configured: escrowConfigured(),
    appId,
    appAddress: getAppAddress(),
    assetId: USDC_ASA,
    operator: process.env.VOUCH_OPERATOR_ADDRESS || null,
  };
}

export async function getEscrowSnapshot(
  sellerId?: string | null,
): Promise<EscrowSnapshot> {
  if (sellerId) {
    const v = ensure(sellerId);
    const onChain = await readSellerBalanceUsdc(sellerId);
    v.balanceUsdc = onChain;
    return {
      sellerId,
      balanceUsdc: roundUsdc(onChain),
      vaultAddress: getEscrowVaultAddress(),
      deposits: [...v.deposits].slice(-20).reverse(),
      remits: [...v.remits].slice(-20).reverse(),
      withdrawals: [...v.withdrawals].slice(-20).reverse(),
    };
  }

  const sellers = await Promise.all(
    Object.keys(vaults).map(async (id) => ({
      sellerId: id,
      balanceUsdc: roundUsdc(await readSellerBalanceUsdc(id)),
    })),
  );

  return {
    vaultAddress: getEscrowVaultAddress(),
    sellers,
  };
}

export interface DepositMeta {
  txId?: string | null;
  amountUsdc?: number;
}

export type DepositResult =
  | { ok: false; error: string }
  | { ok: true; balanceUsdc: number; entry: EscrowDepositEntry };

/**
 * Record a completed on-chain deposit (after wallet submits the group).
 * Balance is re-read from the app box — never demo-credited.
 */
export async function recordDeposit(
  sellerId: string | null | undefined,
  meta: DepositMeta = {},
): Promise<DepositResult> {
  if (!sellerId) return { ok: false, error: "seller_required" };
  if (!escrowConfigured()) {
    return { ok: false, error: "escrow_not_configured" };
  }
  if (!meta.txId) return { ok: false, error: "tx_required" };

  const balanceUsdc = await readSellerBalanceUsdc(sellerId);
  const v = ensure(sellerId);
  v.balanceUsdc = balanceUsdc;
  const entry: EscrowDepositEntry = {
    id: randomBytes(4).toString("hex"),
    type: "deposit",
    amount: roundUsdc(meta.amountUsdc || 0),
    txId: meta.txId,
    mode: "onchain",
    timestamp: new Date().toISOString(),
  };
  v.deposits.push(entry);
  console.log(
    `[vouch:escrow] deposit seller=${sellerId} tx=${meta.txId} bal=${balanceUsdc}`,
  );
  return { ok: true, balanceUsdc, entry };
}

/** @deprecated demo credit removed — use prepareDeposit + recordDeposit */
export function depositEscrow(
  _sellerId: string | null | undefined,
  _amountUsdc: number | string,
  _meta: DepositMeta = {},
): DepositResult {
  return {
    ok: false,
    error: "demo_credit_disabled",
  };
}

export async function prepareSellerDeposit(opts: {
  sellerId: string;
  fromAddress: string;
  amountUsdc: number;
}) {
  if (!escrowConfigured()) {
    throw Object.assign(new Error("Escrow app not configured"), {
      code: "escrow_not_configured",
    });
  }
  // Best-effort on-chain owner bind (new apps). Old app 768991084 has no
  // register_owner — skip and still allow deposit via API payout check.
  const existing = await readSellerOwner(opts.sellerId);
  if (existing) {
    if (existing.toUpperCase() !== opts.fromAddress.toUpperCase()) {
      throw Object.assign(
        new Error(
          `On-chain escrow owner is ${existing}; depositor must match registered owner.`,
        ),
        { code: "owner_mismatch", expected: existing },
      );
    }
  } else {
    try {
      await registerOwnerOnChain({
        sellerId: opts.sellerId,
        ownerAddress: opts.fromAddress,
      });
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (
        /err opcode|logic eval|register_owner|invalid ApplicationArgs/i.test(
          msg,
        )
      ) {
        console.warn(
          `[vouch:escrow] register_owner unavailable on app ${getEscrowAppId()} — deposit continues (redeploy for owner bind). ${msg.slice(0, 160)}`,
        );
      } else {
        throw err;
      }
    }
  }
  return prepareDepositGroup(opts);
}

/** Register seller payout as on-chain escrow owner (idempotent). */
export async function ensureEscrowOwner(
  sellerId: string,
  ownerAddress: string,
): Promise<{ ok: true; txId?: string; already?: boolean } | { ok: false; error: string }> {
  if (!escrowConfigured()) {
    return { ok: false, error: "escrow_not_configured" };
  }
  try {
    const existing = await readSellerOwner(sellerId);
    if (existing) {
      if (existing.toUpperCase() !== ownerAddress.toUpperCase()) {
        return { ok: false, error: "owner_mismatch" };
      }
      return { ok: true, already: true };
    }
    const { txId, already } = await registerOwnerOnChain({
      sellerId,
      ownerAddress,
    });
    return { ok: true, txId: txId || undefined, already };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (
      /err opcode|logic eval|register_owner|invalid ApplicationArgs/i.test(msg)
    ) {
      console.warn(
        `[vouch:escrow] register_owner not on deployed app — skipping until redeploy`,
      );
      return { ok: true, already: true };
    }
    return { ok: false, error: msg };
  }
}

export type WithdrawResult =
  | { ok: false; error: string; balanceUsdc?: number }
  | { ok: true; balanceUsdc: number; entry: EscrowWithdrawEntry; txId: string };

export async function withdrawEscrow(
  sellerId: string,
  amountUsdc: number | string,
  toAddress?: string | null,
): Promise<WithdrawResult> {
  const amount = roundUsdc(amountUsdc);
  if (!(amount > 0)) return { ok: false, error: "amount_invalid" };
  if (!escrowConfigured()) return { ok: false, error: "escrow_not_configured" };
  if (!toAddress) return { ok: false, error: "to_required" };

  try {
    const { txId, balanceUsdc } = await withdrawOnChain({
      sellerId,
      amountUsdc: amount,
      to: toAddress,
    });
    const v = ensure(sellerId);
    v.balanceUsdc = balanceUsdc;
    const entry: EscrowWithdrawEntry = {
      id: randomBytes(4).toString("hex"),
      type: "withdraw",
      amount,
      toAddress,
      timestamp: new Date().toISOString(),
      mode: "onchain",
    };
    v.withdrawals.push(entry);
    return { ok: true, balanceUsdc, entry, txId };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/insufficient/i.test(msg)) {
      return {
        ok: false,
        error: "insufficient_escrow",
        balanceUsdc: await readSellerBalanceUsdc(sellerId),
      };
    }
    return { ok: false, error: msg };
  }
}

export interface RemitArgs {
  sellerId?: string | null;
  settleTxId?: string | null;
  payer?: string | null;
  referrer?: string | null;
  rebateUsdc?: number;
  commissionUsdc?: number;
}

export type RemitResult =
  | {
      ok: false;
      error: string;
      remit?: EscrowRemitEntry;
      need?: number;
      balanceUsdc?: number;
      message?: string;
    }
  | { ok: true; remit: EscrowRemitEntry; balanceUsdc: number };

/**
 * After a full-price native settle, remit rebate + commission on-chain from app.
 */
export async function remitFromEscrow({
  sellerId,
  settleTxId,
  payer,
  referrer,
  rebateUsdc,
  commissionUsdc,
}: RemitArgs): Promise<RemitResult> {
  if (!sellerId) return { ok: false, error: "seller_required" };
  if (!settleTxId) return { ok: false, error: "settle_tx_required" };
  if (!payer) return { ok: false, error: "payer_required" };
  if (!referrer) return { ok: false, error: "referrer_required" };
  if (!escrowConfigured()) {
    return {
      ok: false,
      error: "escrow_not_configured",
      message: "Deploy VouchEscrow and set ESCROW_APP_ID + VOUCH_OPERATOR_MNEMONIC.",
    };
  }

  if (remitBySettle[settleTxId]) {
    return { ok: false, error: "already_remitted", remit: remitBySettle[settleTxId] };
  }
  if (await isSettleRemitted(settleTxId)) {
    return { ok: false, error: "already_remitted" };
  }

  const rebate = roundUsdc(rebateUsdc || 0);
  let commission = roundUsdc(commissionUsdc || 0);

  // Defense in depth: never remit commission (or treat as self-deal) to same wallet
  if (payer.toUpperCase() === referrer.toUpperCase()) {
    return {
      ok: false,
      error: "self_referral_blocked",
      message: "Buyer and referrer are the same address — no escrow remit.",
    };
  }

  const total = roundUsdc(rebate + commission);
  if (!(total > 0)) return { ok: false, error: "nothing_to_remit" };

  const bal = await readSellerBalanceUsdc(sellerId);
  if (bal < total) {
    return {
      ok: false,
      error: "insufficient_escrow",
      need: total,
      balanceUsdc: bal,
      message:
        "Seller promo escrow is underfunded. Deposit USDC into the escrow app before remits.",
    };
  }

  try {
    const chain = await remitOnChain({
      sellerId,
      settleTxId,
      buyer: payer,
      referrer,
      rebateUsdc: rebate,
      commissionUsdc: commission,
    });

    const entry: EscrowRemitEntry = {
      id: randomBytes(4).toString("hex"),
      type: "remit",
      sellerId,
      settleTxId,
      payer,
      referrer,
      rebateUsdc: rebate,
      commissionUsdc: commission,
      totalUsdc: total,
      rebateTxId: chain.rebateTxId,
      commissionTxId: chain.commissionTxId,
      appCallTxId: chain.txId,
      mode: "escrow_onchain",
      timestamp: new Date().toISOString(),
    };

    const v = ensure(sellerId);
    v.balanceUsdc = chain.balanceUsdc;
    v.remits.push(entry);
    remitBySettle[settleTxId] = entry;

    console.log(
      `[vouch:escrow] remit on-chain seller=${sellerId} tx=${chain.txId} rebate=${rebate} commission=${commission} bal=${chain.balanceUsdc}`,
    );

    return { ok: true, remit: entry, balanceUsdc: chain.balanceUsdc };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (err?.code === "already_remitted" || /already remitted/i.test(msg)) {
      return { ok: false, error: "already_remitted" };
    }
    if (/insufficient/i.test(msg)) {
      return {
        ok: false,
        error: "insufficient_escrow",
        balanceUsdc: await readSellerBalanceUsdc(sellerId),
        need: total,
      };
    }
    console.error("[vouch:escrow] remit failed", err);
    return { ok: false, error: msg };
  }
}

export function getRemitForSettle(
  settleTxId: string,
): EscrowRemitEntry | null {
  return remitBySettle[settleTxId] || null;
}

/** No-op kept for API compat — chain fills tx ids during remit. */
export function attachRemitChainTxs(
  settleTxId: string,
  {
    rebateTxId,
    commissionTxId,
  }: { rebateTxId?: string | null; commissionTxId?: string | null },
): EscrowRemitEntry | null {
  const entry = remitBySettle[settleTxId];
  if (!entry) return null;
  if (rebateTxId) entry.rebateTxId = rebateTxId;
  if (commissionTxId) entry.commissionTxId = commissionTxId;
  if (rebateTxId || commissionTxId) entry.mode = "escrow_onchain";
  return entry;
}
