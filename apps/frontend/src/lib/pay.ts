import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402-avm/fetch";
import { registerExactAvmScheme } from "@x402-avm/avm/exact/client";
import { ALGORAND_TESTNET_CAIP2 } from "@x402-avm/avm";
import { extractTxId, explorerTxUrl } from "./explorer";

const API = import.meta.env.VITE_VOUCH_API || "/api";

export type PayingWallet = {
  address: string;
  signTransactions: (...args: any[]) => Promise<any>;
};

/**
 * Build a paying fetch bound to the connected wallet (real USDC on Testnet).
 */
export function createPayingFetch(wallet: PayingWallet) {
  if (!wallet?.address || !wallet?.signTransactions) {
    throw new Error("Connect a wallet that can sign transactions.");
  }

  const signer = {
    address: wallet.address,
    signTransactions: async (txns: any, indexesToSign?: any) => {
      const signed = await wallet.signTransactions(txns, indexesToSign);
      return signed;
    },
  };

  const client = new x402Client();
  registerExactAvmScheme(client, {
    signer: signer as any,
    networks: [ALGORAND_TESTNET_CAIP2, "algorand:*"],
  });

  return wrapFetchWithPayment(globalThis.fetch, client);
}

export type PayResourceArgs = {
  address: string;
  signTransactions: (...args: any[]) => Promise<any>;
  sellerId?: string;
  ref?: string | null;
};

export type PayResourceResult = {
  ok: boolean;
  status: number;
  data: any;
  txId: string | null;
  payment: any;
  remitError?: string;
  remit?: any;
};

/**
 * Pay for a seller resource on-chain via x402 + GoPlausible facilitator.
 */
export async function payResource({
  address,
  signTransactions,
  sellerId = "acme-default",
  ref = null,
}: PayResourceArgs): Promise<PayResourceResult> {
  const payFetch = createPayingFetch({ address, signTransactions });
  const q = new URLSearchParams();
  if (ref) q.set("ref", ref);
  const path = `${API}/r/${sellerId}/resource${q.toString() ? `?${q}` : ""}`;

  const res = await payFetch(path, { method: "GET" });
  const data = await res.json().catch(() => ({}));

  let payment: any = null;
  let txId: string | null = null;
  const header =
    res.headers.get("PAYMENT-RESPONSE") ||
    res.headers.get("payment-response") ||
    res.headers.get("X-PAYMENT-RESPONSE");
  if (header) {
    try {
      payment = decodePaymentResponseHeader(header);
      txId = extractTxId(payment);
    } catch {
      /* ignore decode errors */
    }
  }
  if (!txId) {
    txId = extractTxId(data) || extractTxId(data?.settlement) || null;
  }

  if (!res.ok) {
    let message =
      data.message || data.error || `Payment failed (HTTP ${res.status})`;
    if (res.status === 402) {
      message =
        "Payment was not accepted (still HTTP 402). Usually: wallet not opted into USDC ASA 10458941, insufficient Testnet USDC, cancelled wallet signature, or VOUCH_PAY_TO is not opted into that ASA. Check facilitator settle errors in @vouch/backend logs.";
    }
    const err = new Error(message) as Error & { status: number; data: any };
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return { ok: true, status: res.status, data, txId, payment };
}

export { explorerTxUrl };
