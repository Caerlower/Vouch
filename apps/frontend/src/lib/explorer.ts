/** AlgoKit Lora — TestNet explorer. https://lora.algokit.io/testnet */
export const EXPLORER_BASE = "https://lora.algokit.io/testnet";
const USDC_ASA = "10458941";

/** Algorand tx ids are base32; drop synthetic `/inner/N` suffixes from APIs. */
export function normalizeTxId(
  txId: string | null | undefined,
): string | null {
  if (!txId || typeof txId !== "string") return null;
  const base = txId.trim().split("/")[0];
  if (!/^[A-Z2-7]{40,}$/i.test(base)) return null;
  return base.toUpperCase();
}

export function explorerTxUrl(
  txId: string | null | undefined,
): string | undefined {
  const id = normalizeTxId(txId);
  if (!id) return undefined;
  return `${EXPLORER_BASE}/transaction/${id}`;
}

export function explorerAddressUrl(
  address: string | null | undefined,
): string | undefined {
  if (!address) return undefined;
  return `${EXPLORER_BASE}/account/${address}`;
}

export function explorerAssetUrl(asaId: string | number = USDC_ASA): string {
  return `${EXPLORER_BASE}/asset/${asaId}`;
}

export const USDC_TESTNET_ASA = USDC_ASA;

/** Pull a transaction id from a settle / payment-response payload. */
export function extractTxId(payment: any): string | null {
  if (!payment || typeof payment !== "object") return null;
  return normalizeTxId(
    payment.transaction ||
      payment.txHash ||
      payment.txid ||
      payment.txId ||
      payment.settlement?.transaction ||
      payment.settlement?.txHash ||
      payment.result?.transaction ||
      null,
  );
}
