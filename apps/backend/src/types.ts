/** Shared types for @vouch/backend. */

export type SellerMode = "plain" | "native";

export interface SellerDiscovered {
  asset?: unknown;
  network?: unknown;
  amountAtomic?: string;
  scheme?: string;
}

export interface Seller {
  id: string;
  mode: SellerMode;
  name: string;
  endpointUrl: string;
  dataPath: string;
  resourceUrl: string | null;
  payoutAddress: string;
  basePriceUsdc: number;
  referralDiscountPercent: number;
  referralCommissionPercent: number;
  discovered?: SellerDiscovered | null;
  createdAt: string;
}

export interface PublicSeller {
  id: string;
  name: string;
  mode: SellerMode;
  payoutAddress: string;
  basePriceUsdc: number;
  referralDiscountPercent: number;
  referralCommissionPercent: number;
  createdAt: string;
}

export interface ReferralPayload {
  referrer: string;
  sellerId: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export interface Quote {
  price: number;
  priceLabel: string;
  discountApplied: boolean;
  discountPercent: number;
  referral: string | null;
  referralReason: string;
  referralEligible: boolean;
  remitRebateUsdc: number;
  remitCommissionUsdc: number;
  basePrice: number;
  commissionPercent: number;
  commissionUsdc: number;
  sellerShareUsdc: number;
  sellerId: string;
  sellerMode: SellerMode;
  payload: ReferralPayload | null;
  shortCode: string | null;
}

export interface EscrowDepositEntry {
  id: string;
  type: "deposit";
  amount: number;
  txId: string | null;
  mode: string;
  timestamp: string;
}

export interface EscrowWithdrawEntry {
  id: string;
  type: "withdraw";
  amount: number;
  toAddress: string | null;
  timestamp: string;
  mode: string;
}

export interface EscrowRemitEntry {
  id: string;
  type: "remit";
  sellerId: string;
  settleTxId: string;
  payer: string | null;
  referrer: string | null;
  rebateUsdc: number;
  commissionUsdc: number;
  totalUsdc: number;
  rebateTxId: string | null;
  commissionTxId: string | null;
  /** Parent application-call tx id for the on-chain remit */
  appCallTxId?: string | null;
  mode: string;
  timestamp: string;
}

export interface EscrowVault {
  sellerId: string;
  balanceUsdc: number;
  deposits: EscrowDepositEntry[];
  remits: EscrowRemitEntry[];
  withdrawals: EscrowWithdrawEntry[];
}

export interface EscrowSellerSummary {
  sellerId: string;
  balanceUsdc: number;
}

export type EscrowSnapshot =
  | {
      sellerId: string;
      balanceUsdc: number;
      vaultAddress: string | null;
      deposits: EscrowDepositEntry[];
      remits: EscrowRemitEntry[];
      withdrawals: EscrowWithdrawEntry[];
    }
  | {
      vaultAddress: string | null;
      sellers: EscrowSellerSummary[];
    };

export interface VouchConfig {
  vouchPayTo: string;
  sellerPayoutAddress: string;
  basePriceUsdc: number;
  discountPercent: number;
  commissionPercent: number;
  sellerServiceUrl: string;
}

export interface ShortLink {
  code: string;
  token: string;
  sellerId: string;
  referrer: string | null;
  payload: ReferralPayload | null;
  createdAt: string;
  uses: number;
}

export interface TxnReferralEnvelope {
  scheme: "txn";
  payload: ReferralPayload;
  signedTxn: string;
}

export interface Arc60ReferralEnvelope {
  scheme: "arc60" | string;
  payload: ReferralPayload;
  signature: string;
  authenticatorData: string;
}

export type ReferralEnvelope = TxnReferralEnvelope | Arc60ReferralEnvelope;

export interface SettlementMeta {
  txId?: string | null;
  sellerId?: string | null;
  commissionPercent?: number;
  payoutAddress?: string | null;
}

export interface AccountHistoryEntry {
  type: string;
  amount: number;
  referral?: string | null;
  timestamp: string;
  txId?: string | null;
  sellerId?: string | null;
  fromPayer?: string;
}

export interface AccountRecord {
  paymentsMade: number;
  referralEarnings: number;
  history: AccountHistoryEntry[];
}
