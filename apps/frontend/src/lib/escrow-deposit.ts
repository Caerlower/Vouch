import algosdk from "algosdk";
import { api } from "./api";
import { ALGOD_TOKEN, getAlgodBaseServer } from "./algod";

export type DepositWallet = {
  address: string;
  signTransactions: (
    txns: Uint8Array[] | algosdk.Transaction[],
    indexesToSign?: number[],
  ) => Promise<(Uint8Array | null)[]>;
};

function addrStr(a: unknown): string {
  if (!a) return "";
  if (typeof a === "string") return a;
  if (typeof (a as { toString?: () => string }).toString === "function") {
    return (a as { toString: () => string }).toString();
  }
  return String(a);
}

function assertDepositGroup(
  txns: algosdk.Transaction[],
  prepared: {
    amountMicro: number;
    assetId: number;
    appId: number;
    appAddress: string;
  },
  fromAddress: string,
) {
  if (txns.length !== 2) {
    throw new Error("Expected deposit group of 2 transactions.");
  }
  const [axfer, appCall] = txns;

  if (String(axfer.type) !== "axfer") {
    throw new Error("Deposit group[0] must be an ASA transfer.");
  }
  const xfer = (axfer as any).assetTransfer || {};
  if (Number(xfer.assetIndex) !== Number(prepared.assetId)) {
    throw new Error(
      `Unexpected asset ${xfer.assetIndex}; expected USDC ${prepared.assetId}.`,
    );
  }
  if (Number(xfer.amount) !== Number(prepared.amountMicro)) {
    throw new Error(
      `Unexpected amount ${xfer.amount}; expected ${prepared.amountMicro} microUSDC.`,
    );
  }
  const recv = addrStr(xfer.receiver);
  if (recv.toUpperCase() !== prepared.appAddress.toUpperCase()) {
    throw new Error("ASA receiver is not the escrow app address.");
  }
  const sender = addrStr((axfer as any).sender);
  if (sender.toUpperCase() !== fromAddress.toUpperCase()) {
    throw new Error("ASA sender does not match connected wallet.");
  }

  if (String(appCall.type) !== "appl") {
    throw new Error("Deposit group[1] must be an app call.");
  }
  const appl = (appCall as any).applicationCall || {};
  const appIndex = Number(appl.appIndex ?? (appCall as any).appIndex);
  if (appIndex !== Number(prepared.appId)) {
    throw new Error(
      `Unexpected app ${appIndex}; expected escrow ${prepared.appId}.`,
    );
  }
}

/**
 * Prepare + sign + submit on-chain USDC deposit into VouchEscrow app.
 */
export async function fundSellerEscrow(
  wallet: DepositWallet,
  sellerId: string,
  amountUsdc: number,
): Promise<{ txId: string; balanceUsdc: number }> {
  if (!wallet?.address || !wallet?.signTransactions) {
    throw new Error("Connect a wallet to fund escrow.");
  }
  if (!(amountUsdc > 0)) throw new Error("Enter a deposit amount.");

  const prepared = await api.escrowDepositPrepare(sellerId, {
    fromAddress: wallet.address,
    amountUsdc,
  });

  const txns = (prepared.txnsB64 as string[]).map((b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return algosdk.decodeUnsignedTransaction(bytes);
  });

  assertDepositGroup(
    txns,
    {
      amountMicro: Number(prepared.amountMicro),
      assetId: Number(prepared.assetId),
      appId: Number(prepared.appId),
      appAddress: String(prepared.appAddress),
    },
    wallet.address,
  );

  const signed = await wallet.signTransactions(txns, txns.map((_, i) => i));
  const blobs = signed
    .map((s) => (s instanceof Uint8Array ? s : s ? new Uint8Array(s as any) : null))
    .filter((s): s is Uint8Array => Boolean(s));

  if (blobs.length !== txns.length) {
    throw new Error("Wallet did not sign the full deposit group.");
  }

  // Omit port — empty string strips :port from the base URL in algosdk
  const algod = new algosdk.Algodv2(ALGOD_TOKEN, getAlgodBaseServer());
  const { txid } = await algod.sendRawTransaction(blobs).do();
  await algosdk.waitForConfirmation(algod, txid, 8);

  const recorded = await api.escrowDeposit(sellerId, {
    txId: txid,
    amountUsdc,
  });

  return {
    txId: txid,
    balanceUsdc: Number(recorded.balanceUsdc || 0),
  };
}
