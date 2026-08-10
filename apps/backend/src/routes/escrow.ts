import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { getSeller } from "../sellers.js";
import {
  recordDeposit,
  withdrawEscrow,
  getEscrowSnapshot,
  getEscrowStatus,
  prepareSellerDeposit,
  getRemitForSettle,
  getEscrowVaultAddress,
} from "../escrow.js";
import { isPlausibleAlgorandAddress } from "../pricing.js";
import { escrowConfigured } from "../escrow-chain.js";

const router: Router = createRouter();

function operatorAuthorized(req: Request): boolean {
  const expected = process.env.VOUCH_OPERATOR_API_KEY?.trim();
  if (!expected) return false;
  const got =
    String(req.header("x-vouch-operator-key") || "").trim() ||
    String(req.body?.operatorKey || "").trim();
  return Boolean(got) && got === expected;
}

router.get("/escrow", async (_req: Request, res: Response) => {
  res.json({
    ...(await getEscrowSnapshot()),
    ...getEscrowStatus(),
  });
});

router.get("/escrow/status", (_req: Request, res: Response) => {
  res.json(getEscrowStatus());
});

router.get("/escrow/:sellerId", async (req: Request, res: Response) => {
  const seller = getSeller(String(req.params.sellerId));
  if (!seller) return res.status(404).json({ error: "seller_not_found" });
  res.json({
    ...(await getEscrowSnapshot(seller.id)),
    ...getEscrowStatus(),
    seller: { id: seller.id, name: seller.name, mode: seller.mode },
  });
});

/**
 * Prepare unsigned deposit group for wallet signing.
 * Body: { fromAddress, amountUsdc }
 * fromAddress must be the registered seller payoutAddress (escrow owner).
 */
router.post(
  "/escrow/:sellerId/deposit/prepare",
  async (req: Request, res: Response) => {
    const seller = getSeller(String(req.params.sellerId));
    if (!seller) return res.status(404).json({ error: "seller_not_found" });
    if (seller.mode !== "native") {
      return res.status(400).json({
        error: "escrow_native_only",
        message: "Promo escrow is for native x402 sellers (rebate remits).",
      });
    }
    if (!escrowConfigured()) {
      return res.status(503).json({
        error: "escrow_not_configured",
        message:
          "Deploy VouchEscrow (npm run deploy:escrow) and set ESCROW_APP_ID.",
        ...getEscrowStatus(),
      });
    }

    const fromAddress = String(req.body?.fromAddress || "").trim();
    const amountUsdc = Number(req.body?.amountUsdc);
    if (!isPlausibleAlgorandAddress(fromAddress)) {
      return res.status(400).json({ error: "from_invalid" });
    }
    if (
      !seller.payoutAddress ||
      fromAddress.toUpperCase() !== seller.payoutAddress.toUpperCase()
    ) {
      return res.status(403).json({
        error: "depositor_must_be_seller",
        message:
          "Only the registered seller payout wallet may deposit into this escrow vault.",
        expected: seller.payoutAddress,
      });
    }
    if (!(amountUsdc > 0) || !Number.isFinite(amountUsdc)) {
      return res.status(400).json({ error: "amount_invalid" });
    }

    try {
      const prepared = await prepareSellerDeposit({
        sellerId: seller.id,
        fromAddress,
        amountUsdc,
      });
      return res.json({
        ok: true,
        ...prepared,
        message:
          "Sign both group txns (USDC axfer + app deposit) and submit, then POST /deposit with txId.",
      });
    } catch (err: any) {
      return res.status(400).json({
        error: err?.code || "prepare_failed",
        message: err?.message || String(err),
      });
    }
  },
);

/**
 * Record a completed on-chain deposit (txId of the app-call or group).
 * Body: { txId, amountUsdc? }
 */
router.post("/escrow/:sellerId/deposit", async (req: Request, res: Response) => {
  const seller = getSeller(String(req.params.sellerId));
  if (!seller) return res.status(404).json({ error: "seller_not_found" });
  if (seller.mode !== "native") {
    return res.status(400).json({
      error: "escrow_native_only",
      message: "Promo escrow is for native x402 sellers (rebate remits).",
    });
  }

  const txId = req.body?.txId || null;
  const amountUsdc = Number(req.body?.amountUsdc || 0);
  const result = await recordDeposit(seller.id, { txId, amountUsdc });
  if (!result.ok) {
    return res.status(400).json({
      ...result,
      vaultAddress: getEscrowVaultAddress(),
      ...getEscrowStatus(),
    });
  }
  return res.status(201).json({
    ...result,
    vaultAddress: getEscrowVaultAddress(),
    ...getEscrowStatus(),
    message: "On-chain deposit recorded; balance read from escrow app.",
  });
});

/**
 * Operator-only withdraw. Requires VOUCH_OPERATOR_API_KEY via
 * header x-vouch-operator-key. Destination must be the seller payoutAddress.
 */
router.post(
  "/escrow/:sellerId/withdraw",
  async (req: Request, res: Response) => {
    if (!operatorAuthorized(req)) {
      return res.status(401).json({
        error: "operator_auth_required",
        message:
          "Withdraw requires x-vouch-operator-key matching VOUCH_OPERATOR_API_KEY.",
      });
    }
    const seller = getSeller(String(req.params.sellerId));
    if (!seller) return res.status(404).json({ error: "seller_not_found" });
    const to = req.body?.to || seller.payoutAddress;
    if (!to || !isPlausibleAlgorandAddress(to)) {
      return res.status(400).json({ error: "invalid_to" });
    }
    if (
      !seller.payoutAddress ||
      to.toUpperCase() !== seller.payoutAddress.toUpperCase()
    ) {
      return res.status(403).json({
        error: "withdraw_to_must_be_seller",
        message: "Withdraw destination must be the registered seller payoutAddress.",
      });
    }
    const result = await withdrawEscrow(seller.id, req.body?.amountUsdc, to);
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  },
);

/**
 * Lookup only — remits are executed server-side after x402 settle.
 * Client POST /remit is disabled (was an escrow drain vector).
 */
router.get("/remit/:settleTxId", (req: Request, res: Response) => {
  const settleTxId = String(req.params.settleTxId || "").trim();
  if (!settleTxId) {
    return res.status(400).json({ error: "settle_tx_required" });
  }
  const existing = getRemitForSettle(settleTxId);
  if (!existing) {
    return res.status(404).json({
      ok: false,
      error: "remit_not_found",
      message:
        "No remit for this settle yet. Remits run automatically after x402 settle when escrow is funded.",
    });
  }
  return res.json({
    ok: true,
    already: true,
    remit: existing,
    vaultAddress: getEscrowVaultAddress(),
    ...getEscrowStatus(),
  });
});

router.post("/remit", (_req: Request, res: Response) => {
  return res.status(405).json({
    error: "remit_client_disabled",
    message:
      "Client remits are disabled. Vouch remits automatically after a verified x402 settle. Poll GET /remit/:settleTxId.",
  });
});

export default router;
