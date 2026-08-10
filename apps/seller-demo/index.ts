import express, { type Request, type Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 4001);
// Native 402 payTo for the local mock — override with NATIVE_PAY_TO if needed.
const PAY_TO =
  process.env.NATIVE_PAY_TO ||
  process.env.VOUCH_PAY_TO ||
  "RUXSTPANLEGZY5BDDA3SWRSG5JME67UYXII65XXI6GSY3HCQRSWMAPKCKY";
const BASE_PRICE_USDC = Number(process.env.BASE_PRICE_USDC || 0.05);
const ASA_ID = "10458941";
const NETWORK = "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=";

const app = express();

try {
  fulfillSecret();
} catch (err: any) {
  console.error(`[seller-demo] ${err?.message || err}`);
  process.exit(1);
}

function fulfillSecret(): string {
  const secret = process.env.VOUCH_FULFILL_SECRET?.trim();
  if (!secret) {
    throw new Error("VOUCH_FULFILL_SECRET is required");
  }
  if (secret === "vouch-dev-fulfill-secret-change-me") {
    throw new Error("VOUCH_FULFILL_SECRET must not use the placeholder value");
  }
  return secret;
}

function verifyFulfillToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [sellerId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!sellerId || !Number.isFinite(exp) || exp < Date.now()) return false;
  const payload = `${sellerId}.${expRaw}`;
  let expected: string;
  try {
    expected = createHmac("sha256", fulfillSecret())
      .update(payload)
      .digest("base64url");
  } catch {
    return false;
  }
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function productPayload(extra: Record<string, unknown> = {}) {
  return {
    seller: "Acme Insights Co.",
    product: "premium-market-pulse",
    generatedAt: new Date().toISOString(),
    payload: {
      headline: "Agentic payment rails seeing denser referral loops",
      confidence: 0.86,
      notes: [
        "Seller-service can expose a plain or native-x402 surface.",
        "Vouch adds referrals on top either way.",
      ],
    },
    ...extra,
  };
}

function encodePaymentRequired(): string {
  const atomic = Math.round(BASE_PRICE_USDC * 1e6).toString();
  const body = {
    x402Version: 2,
    error: "payment required",
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        amount: atomic,
        asset: ASA_ID,
        payTo: PAY_TO,
        maxTimeoutSeconds: 60,
        extra: {
          name: "USDC",
          decimals: 6,
          asset: ASA_ID,
        },
      },
    ],
  };
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64");
}

/**
 * Plain internal product API — payment-unaware.
 * Vouch is the front door and already collected payment.
 */
app.get("/data", (_req: Request, res: Response) => {
  res.json(
    productPayload({
      surface: "plain",
      note: "No x402 here — Vouch wrapped this endpoint.",
    }),
  );
});

/**
 * Native x402 surface on Algorand.
 * Direct callers get 402 + PAYMENT-REQUIRED.
 * After Vouch settles, it fulfills with X-Vouch-Fulfill (HMAC).
 */
app.get("/x402/data", (req: Request, res: Response) => {
  const fulfill = req.get("X-Vouch-Fulfill");
  if (verifyFulfillToken(fulfill)) {
    return res.json(
      productPayload({
        surface: "native-x402",
        fulfilledBy: "vouch-hmac-fulfill",
        payTo: PAY_TO,
        note: "Native endpoint fulfilled via Vouch HMAC attestation after settle.",
      }),
    );
  }

  // Reject forgeable legacy header
  if (req.get("X-Vouch-Settled") === "true") {
    return res.status(401).json({
      error: "fulfill_auth_required",
      message: "X-Vouch-Settled is no longer accepted. Expect X-Vouch-Fulfill HMAC.",
    });
  }

  res.status(402).set({
    "PAYMENT-REQUIRED": encodePaymentRequired(),
    "Content-Type": "application/json",
  });
  return res.json({
    error: "payment_required",
    surface: "native-x402",
    message: "Pay USDC on Algorand Testnet to unlock this resource",
    payTo: PAY_TO,
    priceUsdc: BASE_PRICE_USDC,
    asset: ASA_ID,
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "vouch-seller-demo",
    port: PORT,
    surfaces: {
      plain: `http://localhost:${PORT}/data`,
      nativeX402: `http://localhost:${PORT}/x402/data`,
    },
    nativePayTo: PAY_TO,
    fulfillAuth: "X-Vouch-Fulfill HMAC",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[seller-demo] listening on http://localhost:${PORT}`);
  console.log(`[seller-demo] GET /data       (plain — no payment)`);
  console.log(`[seller-demo] GET /x402/data  (native x402 → ${PAY_TO})`);
});
