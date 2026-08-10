import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useWallet } from "@txnlab/use-wallet-react";
import {
  ArrowRight,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { api } from "../lib/api";
import { payResource } from "../lib/pay";
import {
  explorerAddressUrl,
  explorerAssetUrl,
  explorerTxUrl,
  USDC_TESTNET_ASA,
} from "../lib/explorer";
import { shortAddr } from "../lib/referral";
import { Bezel, Btn, Page, SideInk, SideSteps } from "../components/ui";

export default function Go() {
  const { code } = useParams<{ code: string }>();
  const { activeAddress, activeWallet, signTransactions } = useWallet();
  const [link, setLink] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    if (!code) return;
    (async () => {
      try {
        const info = await api.link(code);
        if (cancelled) return;
        setLink(info);
        const q = await api.quote(code, info.sellerId);
        if (!cancelled) setQuote(q);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Unknown referral code");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function pay() {
    setError("");
    setResult(null);
    if (!activeAddress || !signTransactions) {
      setError("Connect a wallet to pay.");
      return;
    }
    if (!link) return;
    setBusy(true);
    try {
      const paid = await payResource({
        address: activeAddress,
        signTransactions,
        sellerId: link.sellerId,
        ref: code,
      });
      let remit = null;
      if (quote?.sellerMode === "native" && quote?.referralEligible && paid.txId) {
        try {
          // Remit runs server-side after settle — poll lookup
          remit = await api.waitForRemit(paid.txId);
        } catch (remitErr: any) {
          // Payment succeeded; remit may need escrow top-up or still settling
          paid.remitError = remitErr.message || String(remitErr);
        }
      }
      setResult({ ...paid, remit });
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const price = Number(quote?.price ?? 0).toFixed(4);
  const native = quote?.sellerMode === "native";
  const discount = quote?.discountApplied
    ? `−${quote.discountPercent}%`
    : native && quote?.referralEligible
      ? `rebate $${Number(quote.remitRebateUsdc || 0).toFixed(4)} after pay`
      : null;
  const ready = Boolean(link && quote);
  const badgeOk =
    ready && (quote?.discountApplied || quote?.referralEligible);

  return (
    <Page
      title="Pay with referral"
      lede={
        <>
          Short code{" "}
          <span className="font-mono text-ink">{code}</span>
          {
            " — still Vouch in the middle. Native: pay seller full list, then Vouch remits. Plain: pay discounted quote."
          }
        </>
      }
    >
      <div className="grid items-start gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Bezel>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/80 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    Paying wallet
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[15px] font-semibold tracking-tight">
                    {activeAddress ? (
                      <a
                        href={explorerAddressUrl(activeAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {shortAddr(activeAddress)}
                      </a>
                    ) : (
                      "Not connected"
                    )}
                  </p>
                  {activeWallet?.metadata?.name && (
                    <p className="mt-0.5 text-[12px] text-muted">
                      via {activeWallet.metadata.name}
                    </p>
                  )}
                </div>
                <span
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold",
                    badgeOk ? "bg-ok/10 text-ok" : "bg-ink/5 text-muted",
                  ].join(" ")}
                >
                  {badgeOk ? (
                    <CheckCircle size={14} weight="fill" />
                  ) : (
                    <WarningCircle size={14} weight="fill" />
                  )}
                  {ready
                    ? quote?.discountApplied
                      ? "Discount ready"
                      : quote?.referralEligible
                        ? "Full pay · Vouch remits rebate"
                        : quote?.referralReason || "Full price"
                    : "Loading…"}
                </span>
              </div>

              <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
                <div className="px-5 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    Quote
                  </p>
                  <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">
                    ${price}
                  </p>
                  {discount && (
                    <p className="mt-0.5 text-[12px] font-semibold text-ok">
                      {discount} vs base
                    </p>
                  )}
                </div>
                <div className="px-5 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    Seller
                  </p>
                  <p className="mt-1 truncate text-[15px] font-semibold tracking-tight">
                    {link?.sellerId || "—"}
                  </p>
                  {link?.referrer && (
                    <p className="mt-0.5 text-[12px] text-muted">
                      via{" "}
                      <a
                        href={explorerAddressUrl(link.referrer)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-signal hover:underline"
                      >
                        {shortAddr(link.referrer)}
                      </a>
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4 px-5 py-5">
                {!activeAddress && (
                  <p className="text-[14px] font-medium text-danger">
                    Connect a wallet in the nav to pay.
                  </p>
                )}

                <p className="text-[13px] text-muted">
                  Settles on{" "}
                  <a
                    href={explorerAssetUrl(USDC_TESTNET_ASA)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-signal hover:underline"
                  >
                    USDC ASA {USDC_TESTNET_ASA}
                  </a>
                  {" · "}
                  Algorand Testnet
                </p>

                <Btn
                  disabled={busy || !activeAddress || !ready}
                  onClick={pay}
                  className="w-full !py-3"
                  arrow
                >
                  {busy ? "Waiting for wallet…" : `Pay $${price} USDC`}
                </Btn>

                {error && (
                  <p className="rounded-xl bg-danger/5 px-3 py-2 text-[13px] font-medium text-danger">
                    {error}
                  </p>
                )}
              </div>

              {result && (
                <div className="border-t border-line bg-ink px-5 py-5 text-white">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">
                    Paid on-chain
                  </p>
                  <p className="mt-2 text-[15px] font-semibold">
                    Resource unlocked
                  </p>
                  {result.txId ? (
                    <a
                      href={explorerTxUrl(result.txId)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block font-mono text-[13px] text-[#93c5fd] hover:underline"
                    >
                      Agent B pay · {result.txId.slice(0, 18)}… (Lora)
                    </a>
                  ) : (
                    <p className="mt-3 text-[13px] text-white/50">
                      No tx id in payment response header
                    </p>
                  )}
                  {result.remit?.remit && (
                    <div className="mt-2 space-y-1 text-[13px] text-white/70">
                      <p>
                        Agent B rebate $
                        {Number(result.remit.remit.rebateUsdc || 0).toFixed(4)}
                        {(result.remit.remit.rebateTxId ||
                          result.remit.remit.appCallTxId) && (
                          <>
                            {" · "}
                            <a
                              href={explorerTxUrl(
                                result.remit.remit.rebateTxId ||
                                  result.remit.remit.appCallTxId,
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[#93c5fd] hover:underline"
                            >
                              Lora
                            </a>
                          </>
                        )}
                      </p>
                      {Number(result.remit.remit.commissionUsdc || 0) > 0 && (
                        <p>
                          Agent A commission $
                          {Number(
                            result.remit.remit.commissionUsdc || 0,
                          ).toFixed(4)}
                          {(result.remit.remit.commissionTxId ||
                            result.remit.remit.appCallTxId) && (
                            <>
                              {" · "}
                              <a
                                href={explorerTxUrl(
                                  result.remit.remit.commissionTxId ||
                                    result.remit.remit.appCallTxId,
                                )}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-[#93c5fd] hover:underline"
                              >
                                Lora
                              </a>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                  {result.remitError && (
                    <p className="mt-2 text-[13px] text-[#fca5a5]">
                      Vouch remit: {result.remitError}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      to="/ledger"
                      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink no-underline"
                    >
                      Open ledger
                      <ArrowRight size={14} weight="bold" />
                    </Link>
                    <Link
                      to="/demo"
                      className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-[13px] font-semibold text-white no-underline"
                    >
                      Cycles
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </Bezel>
        </div>

        <aside className="space-y-3 lg:col-span-5">
          <SideSteps
            items={[
              "Connect the paying wallet",
              "Native: pay full list (Vouch remits after) · Plain: pay discounted quote",
              "Sign the USDC payment on Testnet",
            ]}
          />
          <SideInk
            kicker="Referral link"
            title={
              <>
                Code{" "}
                <span className="text-[#93c5fd]">{code}</span>
              </>
            }
            body="This is Agent A’s referral link. Agent B pays here through Vouch and gets the discount — native as an escrow rebate after full pay, plain as a cheaper quote."
          />
        </aside>
      </div>
    </Page>
  );
}
