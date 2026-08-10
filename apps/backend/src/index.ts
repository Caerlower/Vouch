import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import algosdk from "algosdk";
import { paymentMiddleware, x402ResourceServer } from "@x402-avm/express";
import { HTTPFacilitatorClient } from "@x402-avm/core/server";
import { registerExactAvmScheme } from "@x402-avm/avm/exact/server";
import {
  ALGORAND_TESTNET_CAIP2,
  USDC_TESTNET_ASA_ID,
} from "@x402-avm/avm";
import {
  extractReferral,
  extractSellerId,
  getPrice,
  getConfig,
  atomicToUsdc,
  isPlausibleAlgorandAddress,
  type ReferralExtractable,
} from "./pricing.js";
import {
  recordSettlement,
  seedPayment,
  getStats,
  tryConsumeNonce,
  consumeNonceForChallenge,
  takeChallengeReferral,
  hasPaymentHistory,
} from "./referral-store.js";
import {
  buildReferralPayload,
  encodeArc60Token,
  encodeTxnToken,
  mintSignedReferralFromAccount,
  payloadToClientDataString,
  verifyReferralEnvelope,
} from "./referral-token.js";
import {
  createShortLink,
  getShortLink,
  markShortLinkUsed,
  resolveReferralParam,
} from "./referral-links.js";
import { splitAndForward } from "./payout.js";
import { handleResource } from "./routes/resource.js";
import statsRouter from "./routes/stats.js";
import ledgerRouter from "./routes/ledger.js";
import sellersRouter from "./routes/sellers.js";
import escrowRouter from "./routes/escrow.js";
import { ensureDefaultSeller, getSeller } from "./sellers.js";
import { remitFromEscrow, getEscrowStatus } from "./escrow.js";
import { assertFulfillSecretConfigured } from "./fulfill-token.js";
import type { Quote, ReferralPayload } from "./types.js";

assertFulfillSecretConfigured();

const PORT = Number(process.env.PORT || 4000);
const FACILITATOR_URL =
  process.env.FACILITATOR_URL || "https://facilitator.goplausible.xyz";
const DEMO_MODE =
  String(process.env.DEMO_MODE || "false").toLowerCase() === "true";
const SKIP_FACILITATOR_SYNC =
  String(process.env.SKIP_FACILITATOR_SYNC || "false").toLowerCase() ===
  "true";
const PUBLIC_SITE_URL = (
  process.env.PUBLIC_SITE_URL || "http://localhost:5173"
).replace(/\/+$/, "");

const {
  vouchPayTo,
  sellerPayoutAddress,
  basePriceUsdc,
  discountPercent,
  commissionPercent,
  sellerServiceUrl,
} = getConfig();

ensureDefaultSeller();

if (!vouchPayTo || vouchPayTo.length !== 58) {
  console.warn(
    "[vouch] WARNING: VOUCH_PAY_TO missing or not 58 chars — set it in .env before live payments.",
  );
}

const app = express();
// Render / reverse proxies terminate TLS — needed for correct https resource URLs in 402s.
app.set("trust proxy", 1);
app.use(
  cors({
    origin: true,
    credentials: false,
    // Browser clients on another origin (Vercel) must read these x402 headers.
    exposedHeaders: [
      "PAYMENT-REQUIRED",
      "PAYMENT-RESPONSE",
      "Payment-Required",
      "Payment-Response",
      "X-PAYMENT-RESPONSE",
    ],
    allowedHeaders: [
      "Content-Type",
      "PAYMENT-SIGNATURE",
      "Payment-Signature",
      "PAYMENT-REQUIRED",
      "Payment-Required",
      "X-PAYMENT",
      "X-PAYMENT-RESPONSE",
    ],
  }),
);
app.use(express.json({ limit: "1mb" }));

// ---------------------------------------------------------------------------
// Public (free) routes
// ---------------------------------------------------------------------------
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "vouch-backend",
    role: "x402 referral middleware",
    referralAuth: "arc-60-signed-tokens",
    tokenPolicy: "single-use-on-settlement",
    network: process.env.NETWORK || "algorand-testnet",
    facilitator: FACILITATOR_URL,
    vouchPayTo: vouchPayTo || null,
    sellerPayoutAddress: sellerPayoutAddress || null,
    basePriceUsdc,
    referralDiscountPercent: discountPercent,
    referralCommissionPercent: commissionPercent,
    demoMode: DEMO_MODE,
    escrow: getEscrowStatus(),
    payModel: "direct_to_seller",
    note: "Agents only see Vouch paths (/r/:sellerId/resource, /go/:code). Upstream seller URLs stay private.",
  });
});

app.get("/quote", async (req: Request, res: Response) => {
  const referral = extractReferral(req as ReferralExtractable);
  const sellerId = extractSellerId(req as ReferralExtractable) || "acme-default";
  const quote = await getPrice(referral, { sellerId });
  const seller = getSeller(sellerId) || ensureDefaultSeller();
  res.json({
    ...quote,
    asset: {
      symbol: "USDC",
      asaId: USDC_TESTNET_ASA_ID,
      network: ALGORAND_TESTNET_CAIP2,
    },
    payTo: seller.payoutAddress || vouchPayTo || null,
    payModel: "direct_to_seller",
  });
});

app.use(statsRouter);
app.use(ledgerRouter);
app.use(sellersRouter);
app.use(escrowRouter);

function referralUrls({
  token,
  sellerId,
  referrer,
  payload,
}: {
  token: string;
  sellerId?: string;
  referrer?: string | null;
  payload?: ReferralPayload | null;
}) {
  const sid = sellerId || "acme-default";
  const short = createShortLink({ token, sellerId: sid, referrer, payload });
  // Public share surface is only the site short link — never upstream seller URLs
  return {
    code: short.code,
    shortUrl: `${PUBLIC_SITE_URL}/go/${short.code}`,
    vouchPath: `/r/${sid}/resource?ref=${short.code}`,
  };
}

/** Resolve short referral code → Vouch pay path (no upstream leak). */
app.get("/links/:code", (req: Request, res: Response) => {
  const link = getShortLink(String(req.params.code));
  if (!link) return res.status(404).json({ error: "not_found" });
  res.json({
    code: link.code,
    sellerId: link.sellerId,
    referrer: link.referrer,
    vouchPath: `/r/${link.sellerId}/resource?ref=${link.code}`,
    payUrl: `${PUBLIC_SITE_URL}/go/${link.code}`,
    createdAt: link.createdAt,
  });
});

/**
 * Preferred: assemble from a wallet-signed 0-ALGO self-pay txn (Pera/Defly/Lute).
 * Body: { payload, signedTxn }  // signedTxn base64
 */
app.post("/referrals/assemble", async (req: Request, res: Response) => {
  try {
    const { payload, signedTxn, signature, authenticatorData } = (req.body ||
      {}) as {
      payload?: ReferralPayload;
      signedTxn?: string | Uint8Array | Buffer;
      signature?: string | Uint8Array | Buffer;
      authenticatorData?: string | Uint8Array | Buffer;
    };
    if (!payload?.referrer || !payload?.nonce) {
      return res.status(400).json({
        error: "invalid_body",
        message: "Need payload {referrer,sellerId,nonce,issuedAt,expiresAt}",
      });
    }

    let token: string;
    let scheme: string;

    if (signedTxn) {
      const signedB64 =
        typeof signedTxn === "string"
          ? signedTxn
          : Buffer.from(signedTxn).toString("base64");
      const envelope = { scheme: "txn" as const, payload, signedTxn: signedB64 };
      const verified = await verifyReferralEnvelope(envelope);
      if (!verified.ok) {
        return res.status(400).json({
          error: "invalid_signature",
          reason: verified.reason,
          message: verified.message,
        });
      }
      token = encodeTxnToken({ payload, signedTxn: signedB64 });
      scheme = "txn";
    } else if (signature && authenticatorData) {
      // Legacy ARC-60 path (Lute signData) — often blacks out in web UI
      const sigB64 =
        typeof signature === "string"
          ? signature
          : Buffer.from(signature).toString("base64");
      const authB64 =
        typeof authenticatorData === "string"
          ? authenticatorData
          : Buffer.from(authenticatorData).toString("base64");
      const envelope = {
        scheme: "arc60" as const,
        payload,
        signature: sigB64,
        authenticatorData: authB64,
      };
      const verified = await verifyReferralEnvelope(envelope);
      if (!verified.ok) {
        return res.status(400).json({
          error: "invalid_signature",
          reason: verified.reason,
          message: verified.message,
        });
      }
      token = encodeArc60Token(envelope);
      scheme = "arc60";
    } else {
      return res.status(400).json({
        error: "invalid_body",
        message: "Provide signedTxn (preferred) or ARC-60 signature fields",
      });
    }

    // Eligibility comes from a real prior settlement — never fake-seed here.
    const eligible = hasPaymentHistory(payload.referrer);

    const sellerId = payload.sellerId || "acme-default";
    const urls = referralUrls({
      token,
      sellerId,
      referrer: payload.referrer,
      payload,
    });
    res.json({
      token,
      scheme,
      eligible,
      ...urls,
      shareUrl: urls.shortUrl,
      clientDataString: payloadToClientDataString(payload),
      payload,
      stats: getStats(payload.referrer),
      note: eligible
        ? null
        : "Referrer has no payment history yet. Complete a paid call first, then this link can discount.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: "assemble_failed", message });
  }
});

/** Build unsigned payload for the wallet to embed in a 0-ALGO self-pay note. */
app.post("/referrals/prepare", (req: Request, res: Response) => {
  const referrer = req.body?.referrer as string | undefined;
  const sellerId = (req.body?.sellerId as string | undefined) || "acme-default";
  if (!isPlausibleAlgorandAddress(referrer)) {
    return res.status(400).json({ error: "invalid_referrer" });
  }
  const payload = buildReferralPayload({ referrer, sellerId });
  const clientDataString = payloadToClientDataString(payload);
  res.json({
    payload,
    clientDataString,
    noteUtf8: clientDataString,
    preferredScheme: "txn",
    instructions:
      "Sign a 0-ALGO payment to yourself with note=noteUtf8 via signTransactions, then POST /referrals/assemble { payload, signedTxn }",
  });
});

app.post("/demo/seed", (req: Request, res: Response) => {
  if (!DEMO_MODE) {
    return res.status(403).json({ error: "demo_disabled" });
  }
  const address = req.body?.address as string | undefined;
  if (!isPlausibleAlgorandAddress(address)) {
    return res.status(400).json({
      error: "invalid_address",
      message: "body.address must be a 58-char Algorand address",
    });
  }
  const result = seedPayment(address, req.body?.amount);
  res.json({ seeded: true, result, stats: getStats(address) });
});

/**
 * Demo: mint a real signed referral token (ephemeral keypair).
 * Seeds payment history for the new address so the token is immediately valid.
 */
app.post("/demo/mint-referral", async (req: Request, res: Response) => {
  if (!DEMO_MODE) {
    return res.status(403).json({ error: "demo_disabled" });
  }

  const sellerId = (req.body?.sellerId as string | undefined) || "acme-default";
  const account = algosdk.generateAccount();
  const referrer = account.addr.toString();
  seedPayment(referrer);

  const { token, payload } = await mintSignedReferralFromAccount(
    account,
    sellerId,
  );

  const urls = referralUrls({
    token,
    sellerId,
    referrer,
    payload,
  });

  res.json({
    minted: true,
    referrer,
    // WARNING: demo only — never return sk in production
    demoSecretKey: Buffer.from(account.sk).toString("base64"),
    payload,
    token,
    ...urls,
    shareUrl: urls.shortUrl,
    stats: getStats(referrer),
  });
});

app.post("/demo/simulate-payment", async (req: Request, res: Response) => {
  if (!DEMO_MODE) {
    return res.status(403).json({ error: "demo_disabled" });
  }

  const payer = req.body?.payer as string | undefined;
  if (!isPlausibleAlgorandAddress(payer)) {
    return res.status(400).json({
      error: "invalid_payer",
      message: "body.payer must be a valid Algorand address",
    });
  }

  const referralToken = (req.body?.referral as string | null | undefined) || null;
  const sellerId = (req.body?.sellerId as string | undefined) || "acme-default";
  const quote: Quote = await getPrice(referralToken, { sellerId });

  let validReferral: string | null = null;
  if (quote.referralEligible && quote.payload?.nonce) {
    if (tryConsumeNonce(quote.payload.nonce)) {
      validReferral = quote.referral;
    } else {
      // Race / reuse — fall back to full-price settlement bookkeeping
      quote.discountApplied = false;
      quote.referralEligible = false;
      quote.referralReason = "nonce_reused";
    }
  }

  const settlement = recordSettlement(payer, quote.price, validReferral);
  const payout = await splitAndForward(quote.price, validReferral, {
    sellerId,
    payoutAddress:
      (getSeller(sellerId) || ensureDefaultSeller()).payoutAddress || null,
  });

  let seller: unknown = null;
  try {
    const upstream = await fetch(`${sellerServiceUrl}/data`);
    seller = await upstream.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    seller = { error: "seller_unreachable", message };
  }

  res.json({
    simulated: true,
    quote,
    settlement,
    payout,
    seller,
    stats: validReferral ? getStats(validReferral) : getStats(payer),
  });
});

// ---------------------------------------------------------------------------
// x402 middleware
// ---------------------------------------------------------------------------
// x402 packages ship limited typings — keep settle/price hooks loosely typed.
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient);
registerExactAvmScheme(resourceServer);

resourceServer.onAfterSettle(async (ctx: any) => {
  try {
    const payer = ctx.result?.payer as string | undefined;
    const amountUsdc = atomicToUsdc(ctx.requirements?.amount);
    const resourceUrl = (ctx.paymentPayload?.resource?.url as string) || "";

    let referralParam: string | null = null;
    let sellerId = "acme-default";
    try {
      const u = new URL(resourceUrl, "http://localhost");
      referralParam =
        u.searchParams.get("ref") || u.searchParams.get("referral");
      const pathMatch = u.pathname.match(/\/r\/([^/]+)/);
      if (pathMatch) sellerId = pathMatch[1];
    } catch {
      /* ignore */
    }

    const resolved = resolveReferralParam(referralParam);
    const quote = await getPrice(referralParam, { sellerId });
    let validReferral: string | null = null;
    const seller = getSeller(sellerId) || ensureDefaultSeller();

    if (quote.referralEligible && quote.payload?.nonce) {
      if (seller.mode === "native") {
        // Native: burn nonce at settle (full price already charged)
        if (tryConsumeNonce(quote.payload.nonce)) {
          validReferral = quote.referral;
          if (resolved.code) markShortLinkUsed(resolved.code);
        } else {
          console.warn(
            `[vouch] referral nonce already used — skipping remit settle=${ctx.result?.transaction || "?"}`,
          );
        }
      } else {
        // Plain: nonce was burned when discounted 402 was issued
        const pending = takeChallengeReferral(quote.payload.nonce);
        if (pending?.referrer) {
          validReferral = pending.referrer;
          if (resolved.code) markShortLinkUsed(resolved.code);
        } else if (quote.referral) {
          // Challenge burn missed (e.g. restarted process) — try consume once
          if (tryConsumeNonce(quote.payload.nonce)) {
            validReferral = quote.referral;
            if (resolved.code) markShortLinkUsed(resolved.code);
          }
        }
      }
    }

    // Self-referral: no commission / native remit benefit
    if (
      validReferral &&
      payer &&
      validReferral.toUpperCase() === payer.toUpperCase()
    ) {
      console.warn(
        `[vouch] self-referral blocked payer=${payer} settle=${ctx.result?.transaction || "?"}`,
      );
      validReferral = null;
    }

    const paid = amountUsdc || quote.price;
    const txId = (ctx.result?.transaction as string | undefined) || null;
    const settleMeta = {
      txId,
      sellerId: seller.id,
      commissionPercent: quote.commissionPercent,
      payoutAddress: seller.payoutAddress || null,
    };
    if (payer) {
      recordSettlement(payer, paid, validReferral, settleMeta);
    }
    const payout = await splitAndForward(paid, validReferral, settleMeta);

    // Native + freshly consumed referral: full price already paid; rebate from escrow
    if (
      seller.mode === "native" &&
      validReferral &&
      quote.referralEligible &&
      txId &&
      payer
    ) {
      const remit = await remitFromEscrow({
        sellerId: seller.id,
        settleTxId: txId,
        payer,
        referrer: validReferral,
        rebateUsdc: quote.remitRebateUsdc,
        commissionUsdc: quote.remitCommissionUsdc,
      });
      if (!remit.ok) {
        console.warn(
          `[vouch] escrow remit deferred: ${remit.error} need=${remit.need || "?"} bal=${remit.balanceUsdc ?? "?"}`,
        );
      } else {
        console.log(
          `[vouch] escrow remit ok settle=${txId} mode=${remit.remit.mode}`,
        );
      }
    }

    console.log(
      `[vouch] settled seller=${seller.id} payTo=${seller.payoutAddress || "?"} payer=${payer || "?"} amount=${paid} referral=${validReferral || "none"} settleTx=${txId || "n/a"} mode=${payout.mode}`,
    );
  } catch (err) {
    console.error("[vouch] onAfterSettle error:", err);
  }
});

async function dynamicPrice(context: any): Promise<string> {
  const referral = extractReferral(context as ReferralExtractable);
  const sellerId = extractSellerId(context as ReferralExtractable) || "acme-default";
  const quote = await getPrice(referral, { sellerId });

  // Plain: burn nonce when issuing discounted challenge (prevents N discounted pays)
  if (
    quote.sellerMode !== "native" &&
    quote.discountApplied &&
    quote.referralEligible &&
    quote.payload?.nonce &&
    quote.referral
  ) {
    if (
      !consumeNonceForChallenge(
        quote.payload.nonce,
        quote.referral,
        sellerId,
      )
    ) {
      const base = await getPrice(null, { sellerId });
      return base.priceLabel;
    }
  }

  return quote.priceLabel;
}

async function unpaidBody(context: any) {
  const referral = extractReferral(context as ReferralExtractable);
  const sellerId = extractSellerId(context as ReferralExtractable) || "acme-default";
  const quote = await getPrice(referral, { sellerId });
  const seller = getSeller(sellerId) || ensureDefaultSeller();
  const payToAddr = seller.payoutAddress || vouchPayTo || null;
  return {
    contentType: "application/json",
    body: {
      error: "payment_required",
      service: "vouch-backend",
      message:
        "Pay testnet USDC to the seller receiving address via x402; Vouch fulfills after settle",
      quote,
      payTo: payToAddr,
      sellerId: seller.id,
      sellerMode: seller.mode || "plain",
      payModel: "direct_to_seller",
    },
  };
}

/** x402 payTo = registered seller receiving address (fallback: VOUCH_PAY_TO). */
async function dynamicPayTo(context: any): Promise<string> {
  const sellerId = extractSellerId(context as ReferralExtractable) || "acme-default";
  const seller = getSeller(sellerId) || ensureDefaultSeller();
  const addr =
    seller.payoutAddress ||
    vouchPayTo ||
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  if (!seller.payoutAddress) {
    console.warn(
      `[vouch] seller ${seller.id} has no payoutAddress — falling back to VOUCH_PAY_TO`,
    );
  }
  return addr;
}

const routeAccepts = {
  scheme: "exact",
  network: ALGORAND_TESTNET_CAIP2,
  payTo: dynamicPayTo,
  price: dynamicPrice,
  maxTimeoutSeconds: 60,
  extra: {
    asset: USDC_TESTNET_ASA_ID,
    name: "USDC",
    decimals: 6,
    feePayer:
      process.env.FACILITATOR_FEE_PAYER ||
      "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA",
  },
};

const routes = {
  "GET /resource": {
    accepts: routeAccepts,
    description: "Vouch-gated seller resource (default seller)",
    mimeType: "application/json",
    unpaidResponseBody: unpaidBody,
  },
  "GET /r/*": {
    accepts: routeAccepts,
    description: "Vouch-gated seller resource (per-seller path)",
    mimeType: "application/json",
    unpaidResponseBody: unpaidBody,
  },
};

app.use(
  paymentMiddleware(
    routes as any,
    resourceServer,
    undefined,
    undefined,
    !SKIP_FACILITATOR_SYNC,
  ),
);

app.get("/resource", handleResource);
app.get("/r/:sellerId/resource", handleResource);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Vouch — signed-referral x402 middleware                 ║
╠══════════════════════════════════════════════════════════╣
║  Port:        ${PORT}
║  Resource:    GET /resource  |  GET /r/:sellerId/resource
║  Referral:    ARC-60 signed token (single-use on settle)
║  Sellers:     POST /sellers  |  GET /sellers
║  Facilitator: ${FACILITATOR_URL}
║  Pay model:   DIRECT — x402 payTo = seller receiving addr
║  Fallback:    ${vouchPayTo || "(unset)"}
╚══════════════════════════════════════════════════════════╝
`);
});
