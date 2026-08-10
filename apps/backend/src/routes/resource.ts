import type { Request, Response } from "express";
import { getSeller, ensureDefaultSeller, sellerUpstreamUrl } from "../sellers.js";
import { assertSafeOutboundUrl } from "../url-safety.js";
import { mintFulfillToken } from "../fulfill-token.js";

/**
 * After x402 middleware verifies payment, fetch the seller product and return it.
 * Upstream URLs are never returned to clients.
 */
export async function handleResource(
  req: Request,
  res: Response,
): Promise<Response | void> {
  const sellerId =
    (req.params.sellerId ? String(req.params.sellerId) : undefined) ||
    (typeof req.query.sellerId === "string" ? req.query.sellerId : undefined) ||
    "acme-default";
  const seller = getSeller(sellerId) || ensureDefaultSeller();
  const upstreamUrl = sellerUpstreamUrl(seller);
  const safe = assertSafeOutboundUrl(upstreamUrl);
  if (!safe.ok) {
    return res.status(502).json({
      error: safe.error,
      message: "Seller upstream URL is not allowed",
      sellerId: seller.id,
      mode: seller.mode,
    });
  }
  const referral =
    typeof req.query.referral === "string"
      ? req.query.referral
      : typeof req.query.ref === "string"
        ? req.query.ref
        : null;

  const headers: Record<string, string> = { accept: "application/json" };
  if (seller.mode === "native") {
    // HMAC attestation — native sellers must verify (not a forgeable boolean)
    headers["X-Vouch-Fulfill"] = mintFulfillToken(seller.id);
    headers["X-Vouch-Seller"] = seller.id;
  }

  try {
    const upstream = await fetch(safe.url.toString(), {
      headers,
      redirect: "manual",
    });
    if (!upstream.ok) {
      return res.status(502).json({
        error: "seller_upstream_error",
        status: upstream.status,
        message:
          seller.mode === "native"
            ? "Native seller did not fulfill after settle"
            : "Seller did not return a successful response",
        sellerId: seller.id,
        mode: seller.mode,
      });
    }

    const data: unknown = await upstream.json();
    return res.json({
      vouch: {
        layer: "referral-middleware",
        paidVia: "x402-avm",
        payModel: "direct_to_seller",
        sellerMode: seller.mode || "plain",
        sellerId: seller.id,
        referralTokenPresent: Boolean(referral),
      },
      seller: data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[vouch] seller proxy failed:", message);
    return res.status(502).json({
      error: "seller_unreachable",
      message: "Seller could not be reached",
      sellerId: seller.id,
      mode: seller.mode,
    });
  }
}
