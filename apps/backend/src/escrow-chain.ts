/**
 * On-chain VouchEscrow client (Algorand Application).
 * Artefacts: contracts/escrow/out/VouchEscrow.*.teal + .arc56.json
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import algosdk, {
  AtomicTransactionComposer,
  makeBasicAccountTransactionSigner,
  type TransactionSigner,
} from "algosdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/backend/src → repo root contracts/escrow/out
const OUT = join(__dirname, "../../../contracts/escrow/out");

export const USDC_ASA = Number(process.env.USDC_ASA_ID || 10458941);
export const ALGOD_URL =
  process.env.ALGOD_URL || "https://testnet-api.algonode.cloud";
export const ALGOD_TOKEN = process.env.ALGOD_TOKEN || "";

const enc = new TextEncoder();

let cachedContract: algosdk.ABIContract | null = null;

function loadTeal(name: "approval" | "clear"): string {
  return readFileSync(join(OUT, `VouchEscrow.${name}.teal`), "utf8");
}

function loadContract(): algosdk.ABIContract {
  if (cachedContract) return cachedContract;
  const arc56 = JSON.parse(
    readFileSync(join(OUT, "VouchEscrow.arc56.json"), "utf8"),
  );
  // ARC-56 → ABIContract shape (methods + name)
  cachedContract = new algosdk.ABIContract({
    name: arc56.name,
    methods: arc56.methods.map((m: any) => ({
      name: m.name,
      desc: m.desc,
      args: m.args.map((a: any) => ({
        type: a.type,
        name: a.name,
        desc: a.desc,
      })),
      returns: m.returns,
    })),
  });
  return cachedContract;
}

export function getAlgod(): algosdk.Algodv2 {
  return new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_URL, "");
}

export function getEscrowAppId(): number | null {
  const raw = process.env.ESCROW_APP_ID;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getAppAddress(appId = getEscrowAppId()): string | null {
  if (!appId) return null;
  return algosdk.getApplicationAddress(appId).toString();
}

export function getOperatorAccount(): algosdk.Account | null {
  const mn = process.env.VOUCH_OPERATOR_MNEMONIC?.trim();
  if (!mn) return null;
  return algosdk.mnemonicToSecretKey(mn);
}

export function sellerIdBytes(sellerId: string): Uint8Array {
  return enc.encode(sellerId);
}

export function microUsdc(amountUsdc: number | string): number {
  return Math.round(Number(amountUsdc) * 1e6);
}

export function fromMicroUsdc(micro: number | bigint): number {
  return Number(micro) / 1e6;
}

function boxBalName(sellerId: string): Uint8Array {
  return enc.encode(`bal:${sellerId}`);
}

function boxRemName(settleTxId: string): Uint8Array {
  return enc.encode(`rem:${settleTxId}`);
}

/** Read seller balance from box (microUSDC → USDC). */
export async function readSellerBalanceUsdc(
  sellerId: string,
  appId = getEscrowAppId(),
): Promise<number> {
  if (!appId) return 0;
  const algod = getAlgod();
  try {
    const box = await algod
      .getApplicationBoxByName(appId, boxBalName(sellerId))
      .do();
    const raw = box.value;
    if (!raw || raw.length < 8) return 0;
    // UInt64 big-endian
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const micro = view.getBigUint64(0, false);
    return fromMicroUsdc(micro);
  } catch {
    return 0;
  }
}

export async function isSettleRemitted(
  settleTxId: string,
  appId = getEscrowAppId(),
): Promise<boolean> {
  if (!appId) return false;
  const algod = getAlgod();
  try {
    const box = await algod
      .getApplicationBoxByName(appId, boxRemName(settleTxId))
      .do();
    return Boolean(box.value && box.value.length > 0);
  } catch {
    return false;
  }
}

async function compile(algod: algosdk.Algodv2, source: string) {
  const compiled = await algod.compile(source).do();
  return {
    result: Uint8Array.from(Buffer.from(compiled.result, "base64")),
    hash: compiled.hash,
  };
}

export interface DeployResult {
  appId: number;
  appAddress: string;
  operator: string;
  createTxId: string;
  fundTxId: string;
  bootstrapTxId: string;
}

/** Create app, fund MBR, bootstrap USDC opt-in. */
export async function deployEscrowApp(
  operator: algosdk.Account,
  assetId = USDC_ASA,
): Promise<DeployResult> {
  const algod = getAlgod();
  const approval = await compile(algod, loadTeal("approval"));
  const clear = await compile(algod, loadTeal("clear"));
  const contract = loadContract();
  const createMethod = contract.getMethodByName("create");
  const sp = await algod.getTransactionParams().do();

  const atc = new AtomicTransactionComposer();
  const signer = makeBasicAccountTransactionSigner(operator);

  atc.addMethodCall({
    appID: 0,
    method: createMethod,
    methodArgs: [BigInt(assetId)],
    sender: operator.addr,
    suggestedParams: sp,
    signer,
    approvalProgram: approval.result,
    clearProgram: clear.result,
    numGlobalInts: 2,
    numGlobalByteSlices: 1,
    numLocalInts: 0,
    numLocalByteSlices: 0,
    extraPages: 1,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
  });

  const createResult = await atc.execute(algod, 4);
  const createTxId = createResult.txIDs[0];
  const pending = await algosdk.waitForConfirmation(algod, createTxId, 8);
  const appId = Number(
    (pending as any)["application-index"] ?? (pending as any).applicationIndex,
  );
  if (!appId) throw new Error("deploy failed: no application-index");

  const appAddress = algosdk.getApplicationAddress(appId).toString();

  // Fund app for box MBR + inner fees
  const fundSp = await algod.getTransactionParams().do();
  const fundTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: operator.addr,
    receiver: appAddress,
    amount: 1_000_000, // 1 ALGO for app MBR / boxes
    suggestedParams: fundSp,
  });
  const signedFund = fundTxn.signTxn(operator.sk);
  const { txid: fundTxId } = await algod.sendRawTransaction(signedFund).do();
  await algosdk.waitForConfirmation(algod, fundTxId, 8);

  // Bootstrap: opt into USDC (needs fee for 1 inner)
  const bootSp = await algod.getTransactionParams().do();
  bootSp.fee = BigInt(2_000); // cover inner
  bootSp.flatFee = true;
  const bootAtc = new AtomicTransactionComposer();
  bootAtc.addMethodCall({
    appID: appId,
    method: contract.getMethodByName("bootstrap"),
    methodArgs: [BigInt(assetId)],
    sender: operator.addr,
    suggestedParams: bootSp,
    signer,
    appForeignAssets: [assetId],
  });
  const bootResult = await bootAtc.execute(algod, 4);

  return {
    appId,
    appAddress,
    operator: operator.addr.toString(),
    createTxId,
    fundTxId,
    bootstrapTxId: bootResult.txIDs[0],
  };
}

export interface PreparedDeposit {
  appId: number;
  appAddress: string;
  assetId: number;
  amountMicro: number;
  sellerId: string;
  /** Base64-encoded unsigned txns: [axfer, appCall] */
  txnsB64: string[];
  groupId: string;
}

/** Build unsigned deposit group for wallet signing. */
export async function prepareDepositGroup(opts: {
  sellerId: string;
  fromAddress: string;
  amountUsdc: number;
  appId?: number | null;
}): Promise<PreparedDeposit> {
  const appId = opts.appId ?? getEscrowAppId();
  if (!appId) throw new Error("ESCROW_APP_ID not configured");
  const appAddress = algosdk.getApplicationAddress(appId).toString();
  const amountMicro = microUsdc(opts.amountUsdc);
  if (!(amountMicro > 0)) throw new Error("amount_invalid");

  const algod = getAlgod();
  const contract = loadContract();
  const sp = await algod.getTransactionParams().do();

  const axfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: opts.fromAddress,
    receiver: appAddress,
    amount: amountMicro,
    assetIndex: USDC_ASA,
    suggestedParams: sp,
  });

  // Placeholder signer — replaced by wallet
  const dummySigner: TransactionSigner = async () => {
    throw new Error("sign externally");
  };

  const atc = new AtomicTransactionComposer();
  // Box MBR refs for new seller
  const balBox = boxBalName(opts.sellerId);
  const ownBox = enc.encode(`own:${opts.sellerId}`);

  // ATC inserts the axfer method-arg into the group before the app call
  atc.addMethodCall({
    appID: appId,
    method: contract.getMethodByName("deposit"),
    methodArgs: [
      sellerIdBytes(opts.sellerId),
      { txn: axfer, signer: dummySigner },
    ],
    sender: opts.fromAddress,
    suggestedParams: {
      ...sp,
      fee: BigInt(2_000),
      flatFee: true,
    },
    signer: dummySigner,
    boxes: [
      { appIndex: appId, name: balBox },
      { appIndex: appId, name: ownBox },
    ],
    appForeignAssets: [USDC_ASA],
  });

  const group = atc.buildGroup();
  const txns = group.map((g) => g.txn);
  // Group IDs already assigned by ATC; re-encode for wallet
  if (!txns[0].group) algosdk.assignGroupID(txns);

  return {
    appId,
    appAddress,
    assetId: USDC_ASA,
    amountMicro,
    sellerId: opts.sellerId,
    txnsB64: txns.map((t) => Buffer.from(t.toByte()).toString("base64")),
    groupId: Buffer.from(txns[0].group || []).toString("base64"),
  };
}

export interface RemitOnChainArgs {
  sellerId: string;
  settleTxId: string;
  buyer: string;
  referrer: string;
  rebateUsdc: number;
  commissionUsdc: number;
}

export interface RemitOnChainResult {
  txId: string;
  rebateTxId: string | null;
  commissionTxId: string | null;
  balanceUsdc: number;
}

/** Operator-signed remit with inner ASA transfers. */
export async function remitOnChain(
  args: RemitOnChainArgs,
): Promise<RemitOnChainResult> {
  const appId = getEscrowAppId();
  if (!appId) throw new Error("ESCROW_APP_ID not configured");
  const operator = getOperatorAccount();
  if (!operator) throw new Error("VOUCH_OPERATOR_MNEMONIC not configured");

  if (await isSettleRemitted(args.settleTxId, appId)) {
    throw Object.assign(new Error("already_remitted"), {
      code: "already_remitted",
    });
  }

  const rebate = microUsdc(args.rebateUsdc);
  const commission = microUsdc(args.commissionUsdc);
  const algod = getAlgod();
  const contract = loadContract();
  const signer = makeBasicAccountTransactionSigner(operator);
  const sp = await algod.getTransactionParams().do();
  // Outer fee covers up to 2 inner axfers
  const feeMultiplier = 1 + (rebate > 0 ? 1 : 0) + (commission > 0 ? 1 : 0);
  sp.fee = BigInt(1000 * feeMultiplier);
  sp.flatFee = true;

  const balBox = boxBalName(args.sellerId);
  const remBox = boxRemName(args.settleTxId);

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    appID: appId,
    method: contract.getMethodByName("remit"),
    methodArgs: [
      sellerIdBytes(args.sellerId),
      enc.encode(args.settleTxId),
      args.buyer,
      args.referrer,
      BigInt(rebate),
      BigInt(commission),
      BigInt(USDC_ASA),
    ],
    sender: operator.addr,
    suggestedParams: sp,
    signer,
    boxes: [
      { appIndex: appId, name: balBox },
      { appIndex: appId, name: remBox },
    ],
    appAccounts: [args.buyer, args.referrer],
    appForeignAssets: [USDC_ASA],
  });

  const result = await atc.execute(algod, 8);
  const txId = result.txIDs[0];
  const confirmed = await algosdk.waitForConfirmation(algod, txId, 8);

  // Inner txns are in the confirmed txn's inner-txns
  const inners: any[] =
    (confirmed as any)["inner-txns"] ||
    (confirmed as any).innerTxns ||
    [];
  const innerTxIds: string[] = inners
    .map((it: any) => it?.txn?.txn?.txid || it?.id || null)
    .filter(Boolean);

  // PendingTransactionResponse often doesn't include child txids as explorer ids;
  // derive from group / use parent + index. Prefer indexer-style: parent tx has inners.
  let rebateTxId: string | null = null;
  let commissionTxId: string | null = null;
  if (rebate > 0 && commission > 0) {
    rebateTxId = innerTxIds[0] || `${txId}/inner/0`;
    commissionTxId = innerTxIds[1] || `${txId}/inner/1`;
  } else if (rebate > 0) {
    rebateTxId = innerTxIds[0] || `${txId}/inner/0`;
  } else if (commission > 0) {
    commissionTxId = innerTxIds[0] || `${txId}/inner/0`;
  }

  const balanceUsdc = await readSellerBalanceUsdc(args.sellerId, appId);
  return { txId, rebateTxId, commissionTxId, balanceUsdc };
}

export async function withdrawOnChain(opts: {
  sellerId: string;
  amountUsdc: number;
  to: string;
}): Promise<{ txId: string; balanceUsdc: number }> {
  const appId = getEscrowAppId();
  if (!appId) throw new Error("ESCROW_APP_ID not configured");
  const operator = getOperatorAccount();
  if (!operator) throw new Error("VOUCH_OPERATOR_MNEMONIC not configured");

  const amount = microUsdc(opts.amountUsdc);
  const algod = getAlgod();
  const contract = loadContract();
  const signer = makeBasicAccountTransactionSigner(operator);
  const sp = await algod.getTransactionParams().do();
  sp.fee = BigInt(2_000);
  sp.flatFee = true;

  const atc = new AtomicTransactionComposer();
  atc.addMethodCall({
    appID: appId,
    method: contract.getMethodByName("withdraw"),
    methodArgs: [
      sellerIdBytes(opts.sellerId),
      BigInt(amount),
      opts.to,
      BigInt(USDC_ASA),
    ],
    sender: operator.addr,
    suggestedParams: sp,
    signer,
    boxes: [
      { appIndex: appId, name: boxBalName(opts.sellerId) },
      { appIndex: appId, name: enc.encode(`own:${opts.sellerId}`) },
    ],
    appAccounts: [opts.to],
    appForeignAssets: [USDC_ASA],
  });

  const result = await atc.execute(algod, 8);
  return {
    txId: result.txIDs[0],
    balanceUsdc: await readSellerBalanceUsdc(opts.sellerId, appId),
  };
}

export function escrowConfigured(): boolean {
  return Boolean(getEscrowAppId() && getOperatorAccount());
}

/** Operator binds seller_id → owner before deposits are allowed. */
export async function registerOwnerOnChain(opts: {
  sellerId: string;
  ownerAddress: string;
}): Promise<{ txId: string; already?: boolean }> {
  const appId = getEscrowAppId();
  if (!appId) throw new Error("ESCROW_APP_ID not configured");
  const operator = getOperatorAccount();
  if (!operator) throw new Error("VOUCH_OPERATOR_MNEMONIC not configured");

  const algod = getAlgod();
  const contract = loadContract();
  const signer = makeBasicAccountTransactionSigner(operator);
  const sp = await algod.getTransactionParams().do();
  sp.fee = BigInt(1_000);
  sp.flatFee = true;

  const ownBox = enc.encode(`own:${opts.sellerId}`);

  try {
    const atc = new AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: contract.getMethodByName("register_owner"),
      methodArgs: [sellerIdBytes(opts.sellerId), opts.ownerAddress],
      sender: operator.addr,
      suggestedParams: sp,
      signer,
      boxes: [{ appIndex: appId, name: ownBox }],
      appAccounts: [opts.ownerAddress],
    });
    const result = await atc.execute(algod, 8);
    return { txId: result.txIDs[0] };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/already registered/i.test(msg)) {
      return { txId: "", already: true };
    }
    throw err;
  }
}

/** Read on-chain owner box if present. */
export async function readSellerOwner(
  sellerId: string,
  appId = getEscrowAppId(),
): Promise<string | null> {
  if (!appId) return null;
  const algod = getAlgod();
  try {
    const box = await algod
      .getApplicationBoxByName(appId, enc.encode(`own:${sellerId}`))
      .do();
    const raw = box.value;
    if (!raw || raw.length < 32) return null;
    return algosdk.encodeAddress(Uint8Array.from(raw.slice(0, 32)));
  } catch {
    return null;
  }
}
