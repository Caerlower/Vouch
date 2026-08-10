import { decodePaymentRequiredHeader } from "@x402-avm/core/http";
import { assertSafeOutboundUrl } from "./url-safety.js";

export type ProbeNativeOk = {
  ok: true;
  resourceUrl: string;
  payTo: string;
  basePriceUsdc: number;
  amountAtomic: string;
  asset: unknown;
  network: unknown;
  scheme: string;
  raw: unknown;
};

export type ProbeNativeErr = {
  ok: false;
  error: string;
  status?: number;
  detail?: string;
};

export type ProbeNativeResult = ProbeNativeOk | ProbeNativeErr;

/**
 * Probe a native x402 resource URL. Expects HTTP 402 + PAYMENT-REQUIRED.
 */
export async function probeNativeX402(
  resourceUrl: string | null | undefined,
): Promise<ProbeNativeResult> {
  if (!resourceUrl || !String(resourceUrl).trim()) {
    return { ok: false, error: "resource_url_required" };
  }

  const safe = assertSafeOutboundUrl(resourceUrl);
  if (!safe.ok) {
    return { ok: false, error: safe.error, detail: safe.message };
  }
  const url = safe.url;

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "manual",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: "unreachable",
      detail,
    };
  }

  if (res.status !== 402) {
    return {
      ok: false,
      error: "expected_402",
      status: res.status,
      detail: `Native x402 endpoints should return HTTP 402. Got ${res.status}.`,
    };
  }

  const header =
    res.headers.get("PAYMENT-REQUIRED") ||
    res.headers.get("payment-required");
  if (!header) {
    return {
      ok: false,
      error: "missing_payment_required_header",
      status: 402,
    };
  }

  let required: {
    accepts?: Array<{
      payTo?: string;
      amount?: string | number | bigint;
      asset?: unknown;
      network?: unknown;
      scheme?: string;
      extra?: { decimals?: number; asset?: unknown };
    }>;
  };
  try {
    required = decodePaymentRequiredHeader(header) as typeof required;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: "invalid_payment_required_header",
      detail,
    };
  }

  const accept = required?.accepts?.[0];
  if (!accept?.payTo || accept.amount == null) {
    return {
      ok: false,
      error: "accepts_incomplete",
      detail: "PAYMENT-REQUIRED.accepts[0] needs payTo and amount",
    };
  }

  const amountAtomic = BigInt(String(accept.amount));
  const decimals = Number(accept.extra?.decimals ?? 6);
  const basePriceUsdc = Number(amountAtomic) / 10 ** decimals;

  return {
    ok: true,
    resourceUrl: url.toString(),
    payTo: accept.payTo,
    basePriceUsdc,
    amountAtomic: amountAtomic.toString(),
    asset: accept.asset || accept.extra?.asset || null,
    network: accept.network || null,
    scheme: accept.scheme || "exact",
    raw: required,
  };
}
