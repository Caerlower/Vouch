/**
 * Shared Testnet algod — keep in sync with backend ALGOD_URL.
 *
 * IMPORTANT: do not put `:port` in this URL when using @txnlab/use-wallet.
 * It always constructs `new Algodv2(token, baseServer, port || "")`, and an
 * empty-string port strips an embedded port (localhost:5173 → localhost).
 */
export function getAlgodBaseServer(): string {
  const fromEnv = import.meta.env.VITE_ALGOD_URL as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "https://testnet-api.algonode.cloud";
}

export const ALGOD_TOKEN = (import.meta.env.VITE_ALGOD_TOKEN as string) || "";
