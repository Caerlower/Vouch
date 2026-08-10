import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import {
  getSeller,
  registerSeller,
  listPublicSellers,
  toPublicSeller,
} from "../sellers.js";
import { probeNativeX402 } from "../probe-native.js";
import { getEscrowSnapshot, getEscrowStatus } from "../escrow.js";
import { ensureEscrowOwner } from "../escrow.js";
import { assertSafeOutboundUrl } from "../url-safety.js";

const router: Router = createRouter();

router.get("/sellers", (_req: Request, res: Response) => {
  res.json({ sellers: listPublicSellers() });
});

router.get("/sellers/:id", (req: Request, res: Response) => {
  const seller = getSeller(String(req.params.id));
  if (!seller) {
    return res.status(404).json({ error: "not_found" });
  }
  return res.json({
    seller: toPublicSeller(seller),
    // Public agent path only — never the upstream HTTP URL
    vouchPath: `/r/${seller.id}/resource`,
  });
});

router.post("/sellers/probe", async (req: Request, res: Response) => {
  const result = await probeNativeX402(
    req.body?.resourceUrl || req.body?.url || req.body?.endpointUrl,
  );
  if (!result.ok) {
    const message =
      result.error === "expected_402"
        ? result.detail
        : result.error === "unreachable"
          ? `Could not reach URL: ${result.detail}`
          : result.error;
    return res.status(400).json({ ...result, message });
  }
  // Probe response is only for the registering seller — still omit raw resource echo if needed
  return res.json({
    ok: true,
    payTo: result.payTo,
    basePriceUsdc: result.basePriceUsdc,
    amountAtomic: result.amountAtomic,
    asset: result.asset,
    network: result.network,
    scheme: result.scheme,
  });
});

router.post("/sellers", async (req: Request, res: Response) => {
  const mode = req.body?.mode === "native" ? "native" : "plain";
  let payoutAddress: string | null =
    req.body?.payoutAddress || req.body?.payout_address || null;
  let basePriceUsdc: number | string | undefined =
    req.body?.basePriceUsdc ?? req.body?.base_price_usdc ?? undefined;
  let discovered: {
    asset: unknown;
    network: unknown;
    amountAtomic: string;
    scheme: string;
  } | null = null;
  let resourceUrl: string | null =
    req.body?.resourceUrl || req.body?.resource_url || null;

  if (mode === "plain") {
    const endpoint =
      req.body?.endpointUrl || req.body?.endpoint_url || null;
    const safe = assertSafeOutboundUrl(endpoint);
    if (!safe.ok) {
      return res.status(400).json({
        error: safe.error,
        message: safe.message || "Endpoint URL is not allowed",
      });
    }
  }

  if (mode === "native") {
    resourceUrl =
      resourceUrl || req.body?.endpointUrl || req.body?.endpoint_url;
    const probed = await probeNativeX402(resourceUrl);
    if (!probed.ok) {
      const message =
        probed.error === "expected_402"
          ? probed.detail
          : probed.error === "resource_url_required"
            ? "Native resource URL is required"
            : probed.error;
      return res.status(400).json({ ...probed, message });
    }
    discovered = {
      asset: probed.asset,
      network: probed.network,
      amountAtomic: probed.amountAtomic,
      scheme: probed.scheme,
    };
    payoutAddress = probed.payTo;
    basePriceUsdc = probed.basePriceUsdc;
    if (req.body?.payoutAddress || req.body?.payout_address) {
      const clientPayTo = String(
        req.body?.payoutAddress || req.body?.payout_address,
      ).trim();
      if (
        clientPayTo &&
        clientPayTo.toUpperCase() !== probed.payTo.toUpperCase()
      ) {
        return res.status(400).json({
          error: "payto_mismatch",
          message:
            "Native payTo must match the probed x402 resource. Client override is not allowed.",
          probedPayTo: probed.payTo,
        });
      }
    }
  }

  const result = registerSeller({
    mode,
    name: req.body?.name,
    endpointUrl: req.body?.endpointUrl || req.body?.endpoint_url,
    resourceUrl,
    payoutAddress,
    basePriceUsdc,
    referralDiscountPercent:
      req.body?.referralDiscountPercent ?? req.body?.discount_percent,
    referralCommissionPercent:
      req.body?.referralCommissionPercent ?? req.body?.commission_percent,
    dataPath: req.body?.dataPath || req.body?.data_path || "/data",
    discovered,
  });

  if (!result.ok) {
    const message =
      result.error === "payout_address_invalid"
        ? "Receiving address must be a valid 58-character Algorand address"
        : result.error === "endpoint_url_required"
          ? "Endpoint URL is required"
          : result.error === "resource_url_required"
            ? "Native x402 resource URL is required"
            : result.message || result.error;
    return res.status(400).json({ ...result, message });
  }

  const origin = `${req.protocol}://${req.get("host")}`;
  const escrowStatus = getEscrowStatus();
  let escrow = null;
  if (result.seller.mode === "native") {
    let ownerReg: Awaited<ReturnType<typeof ensureEscrowOwner>> | null = null;
    if (result.seller.payoutAddress) {
      ownerReg = await ensureEscrowOwner(
        result.seller.id,
        result.seller.payoutAddress,
      );
      if (!ownerReg.ok) {
        console.warn(
          `[vouch] escrow owner register failed seller=${result.seller.id}: ${ownerReg.error}`,
        );
      }
    }
    escrow = {
      ...(await getEscrowSnapshot(result.seller.id)),
      ...escrowStatus,
      fundRequired: true,
      ownerRegistered: ownerReg?.ok === true,
      ownerRegisterError: ownerReg && !ownerReg.ok ? ownerReg.error : null,
      message:
        "Deposit Testnet USDC into the escrow app before native remits will succeed.",
    };
  }

  return res.status(201).json({
    seller: toPublicSeller(result.seller),
    vouchPath: `/r/${result.seller.id}/resource`,
    vouchUrl: `${origin}/r/${result.seller.id}/resource`,
    escrow,
    message:
      result.seller.mode === "native"
        ? "Native seller registered. Fund on-chain escrow, then agents pay full price; remits draw from the app."
        : "Plain API registered behind Vouch. Upstream URL is private — only vouchPath is public.",
  });
});

export default router;
