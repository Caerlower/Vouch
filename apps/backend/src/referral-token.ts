import { createHash, randomBytes } from "node:crypto";
import algosdk from "algosdk";
import { signAsync, verifyAsync } from "@noble/ed25519";
import { canonify } from "canonify";
import type {
  Arc60ReferralEnvelope,
  ReferralEnvelope,
  ReferralPayload,
  TxnReferralEnvelope,
} from "./types.js";

/**
 * Signed referral tokens.
 *
 * Preferred scheme (all wallets): "txn"
 *   { scheme: "txn", payload, signedTxn: <base64 of signed 0-ALGO self-pay> }
 *
 * Legacy / demo scheme: "arc60" (Lute signData)
 *   { scheme: "arc60", payload, signature, authenticatorData }
 *
 * Tokens are single-use: nonce consumed on successful settlement.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function buildReferralPayload({
  referrer,
  sellerId,
  ttlMs = DEFAULT_TTL_MS,
  nonce = randomBytes(16).toString("hex"),
}: {
  referrer: string;
  sellerId: string;
  ttlMs?: number;
  nonce?: string;
}): ReferralPayload {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  return {
    referrer,
    sellerId,
    nonce,
    issuedAt,
    expiresAt,
  };
}

export function payloadToClientDataString(payload: ReferralPayload): string {
  const s = canonify(payload);
  if (!s) throw new Error("Failed to canonify referral payload");
  return s;
}

export function sha256(bytesOrString: string | Uint8Array | Buffer): Buffer {
  const buf =
    typeof bytesOrString === "string"
      ? Buffer.from(bytesOrString, "utf8")
      : Buffer.from(bytesOrString);
  return createHash("sha256").update(buf).digest();
}

export function buildArc60Message(
  clientDataString: string,
  authenticatorDataBytes: Buffer | Uint8Array,
): Uint8Array {
  const clientHash = sha256(clientDataString);
  const authHash = sha256(authenticatorDataBytes);
  const toSign = new Uint8Array(64);
  toSign.set(clientHash, 0);
  toSign.set(authHash, 32);
  return toSign;
}

export function encodeToken(envelope: ReferralEnvelope | Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

type DecodeOk = { ok: true; envelope: ReferralEnvelope };
type DecodeErr = { ok: false; reason: string };
type DecodeResult = DecodeOk | DecodeErr;

function parseEnvelopeJson(json: string): DecodeResult {
  const envelope = JSON.parse(json) as Record<string, unknown>;
  if (envelope?.signedTxn && envelope?.payload) {
    return {
      ok: true,
      envelope: { scheme: "txn", ...envelope } as TxnReferralEnvelope,
    };
  }
  if (envelope?.payload && envelope?.signature && envelope?.authenticatorData) {
    return {
      ok: true,
      envelope: {
        scheme: (envelope.scheme as string) || "arc60",
        ...envelope,
      } as Arc60ReferralEnvelope,
    };
  }
  return { ok: false, reason: "malformed_envelope" };
}

export function decodeToken(token: unknown): DecodeResult {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "missing_token" };
  }

  if (token.length === 58 && /^[A-Z2-7]+$/.test(token)) {
    return { ok: false, reason: "raw_address_not_allowed" };
  }

  for (const encoding of ["base64url", "base64"] as const) {
    try {
      const json = Buffer.from(token, encoding).toString("utf8");
      return parseEnvelopeJson(json);
    } catch {
      /* try next */
    }
  }
  return { ok: false, reason: "decode_failed" };
}

type TimestampCheck =
  | { ok: true }
  | { ok: false; reason: string };

function checkPayloadTimestamps(payload: ReferralPayload | undefined): TimestampCheck {
  if (!payload?.referrer || typeof payload.referrer !== "string") {
    return { ok: false, reason: "missing_referrer" };
  }
  if (!payload.sellerId || typeof payload.sellerId !== "string") {
    return { ok: false, reason: "missing_seller_id" };
  }
  if (!payload.expiresAt || typeof payload.expiresAt !== "string") {
    return { ok: false, reason: "missing_expires_at" };
  }
  if (Date.parse(payload.expiresAt) < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (payload.issuedAt && Date.parse(payload.issuedAt) > Date.now() + 60_000) {
    return { ok: false, reason: "issued_in_future" };
  }
  return { ok: true };
}

export type VerifyOk = {
  ok: true;
  payload: ReferralPayload;
  clientDataString: string;
  scheme: string;
};
export type VerifyErr = {
  ok: false;
  reason: string;
  message?: string;
};
export type VerifyResult = VerifyOk | VerifyErr;

export async function verifyArc60Signature(
  envelope: Arc60ReferralEnvelope,
): Promise<VerifyResult> {
  const times = checkPayloadTimestamps(envelope.payload);
  if (!times.ok) return times;

  try {
    const { payload, signature, authenticatorData } = envelope;
    const clientDataString = payloadToClientDataString(payload);
    const authBytes = Buffer.from(authenticatorData, "base64");
    const sigBytes = Buffer.from(signature, "base64");
    const toSign = buildArc60Message(clientDataString, authBytes);
    const pubKey = algosdk.Address.fromString(payload.referrer).publicKey;
    const ok = await verifyAsync(sigBytes, toSign, pubKey);
    if (!ok) return { ok: false, reason: "bad_signature" };
    return { ok: true, payload, clientDataString, scheme: "arc60" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "verify_error", message };
  }
}

/**
 * Verify a 0-ALGO self-payment whose note is the referral payload JSON.
 * Works with Pera / Defly / Lute transaction signing (no ARC-60 needed).
 */
export async function verifyTxnSignature(
  envelope: TxnReferralEnvelope,
): Promise<VerifyResult> {
  const times = checkPayloadTimestamps(envelope.payload);
  if (!times.ok) return times;

  try {
    const signedBytes = Buffer.from(envelope.signedTxn, "base64");
    const decoded = algosdk.decodeSignedTransaction(signedBytes);
    if (!decoded?.sig) {
      return { ok: false, reason: "missing_txn_sig" };
    }

    const sender = String(decoded.txn.sender);
    if (sender !== envelope.payload.referrer) {
      return { ok: false, reason: "sender_mismatch" };
    }

    const txnAny = decoded.txn as unknown as {
      payment?: { amount?: bigint | number; receiver?: unknown };
      amount?: bigint | number;
      receiver?: unknown;
      note?: Uint8Array;
      bytesToSign: () => Uint8Array;
    };
    const amount = txnAny.payment?.amount ?? txnAny.amount ?? 0n;
    if (amount !== 0n && amount !== 0) {
      return { ok: false, reason: "nonzero_amount" };
    }

    const receiver = String(
      txnAny.payment?.receiver || txnAny.receiver || "",
    );
    if (receiver && receiver !== sender) {
      return { ok: false, reason: "not_self_pay" };
    }

    if (!decoded.txn.note) {
      return { ok: false, reason: "missing_note" };
    }
    const noteStr = Buffer.from(decoded.txn.note).toString("utf8");
    let notePayload: ReferralPayload;
    try {
      notePayload = JSON.parse(noteStr) as ReferralPayload;
    } catch {
      return { ok: false, reason: "note_not_json" };
    }

    // Note must match claimed payload (canonify both for key-order independence)
    const claimed = payloadToClientDataString(envelope.payload);
    const fromNote = payloadToClientDataString(notePayload);
    if (claimed !== fromNote) {
      return { ok: false, reason: "payload_mismatch" };
    }

    const toSign = decoded.txn.bytesToSign();
    const pubKey = algosdk.Address.fromString(sender).publicKey;
    const ok = await verifyAsync(decoded.sig, toSign, pubKey);
    if (!ok) return { ok: false, reason: "bad_signature" };

    return {
      ok: true,
      payload: envelope.payload,
      clientDataString: claimed,
      scheme: "txn",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "verify_error", message };
  }
}

/** Dispatch by scheme. */
export async function verifyReferralEnvelope(
  envelope: ReferralEnvelope | (Partial<TxnReferralEnvelope> & Partial<Arc60ReferralEnvelope>),
): Promise<VerifyResult> {
  if (envelope.scheme === "txn" || "signedTxn" in envelope && envelope.signedTxn) {
    return verifyTxnSignature(envelope as TxnReferralEnvelope);
  }
  return verifyArc60Signature(envelope as Arc60ReferralEnvelope);
}

export function encodeTxnToken({
  payload,
  signedTxn,
}: {
  payload: ReferralPayload;
  signedTxn: string | Uint8Array | Buffer;
}): string {
  const signedB64 =
    typeof signedTxn === "string"
      ? signedTxn
      : Buffer.from(signedTxn).toString("base64");
  return encodeToken({
    scheme: "txn",
    payload,
    signedTxn: signedB64,
  });
}

export function encodeArc60Token({
  payload,
  signature,
  authenticatorData,
}: {
  payload: ReferralPayload;
  signature: string | Uint8Array | Buffer;
  authenticatorData: string | Uint8Array | Buffer;
}): string {
  const sigB64 =
    typeof signature === "string"
      ? signature
      : Buffer.from(signature).toString("base64");
  const authB64 =
    typeof authenticatorData === "string"
      ? authenticatorData
      : Buffer.from(authenticatorData).toString("base64");
  return encodeToken({
    scheme: "arc60",
    payload,
    signature: sigB64,
    authenticatorData: authB64,
  });
}

/** Demo mint still uses ARC-60-shaped crypto with an ephemeral key. */
export async function signReferralPayload(
  payload: ReferralPayload,
  secretKey: Uint8Array | Buffer | number[],
): Promise<string> {
  const sk = secretKey instanceof Uint8Array ? secretKey : new Uint8Array(secretKey);
  const seed = sk.length === 64 ? sk.slice(0, 32) : sk;
  const clientDataString = payloadToClientDataString(payload);
  const authenticatorData = randomBytes(37);
  const toSign = buildArc60Message(clientDataString, authenticatorData);
  const signature = await signAsync(toSign, seed);
  return encodeArc60Token({ payload, signature, authenticatorData });
}

export async function mintSignedReferralFromAccount(
  account: { addr: { toString(): string }; sk: Uint8Array },
  sellerId: string,
  ttlMs?: number,
): Promise<{ payload: ReferralPayload; token: string; referrer: string }> {
  const payload = buildReferralPayload({
    referrer: account.addr.toString(),
    sellerId,
    ttlMs,
  });
  const token = await signReferralPayload(payload, account.sk);
  return { payload, token, referrer: payload.referrer };
}
