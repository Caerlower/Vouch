import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@txnlab/use-wallet-react";
import algosdk from "algosdk";
import {
  ArrowRight,
  CheckCircle,
  Copy,
  LinkSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { api } from "../lib/api";
import { bytesToBase64, shortAddr } from "../lib/referral";
import { Bezel, Btn, Page, SideInk, SideSteps } from "../components/ui";

export default function Refer() {
  const { activeAddress, activeWallet, signTransactions, algodClient } =
    useWallet();
  const [sellers, setSellers] = useState<any[]>([]);
  const [sellerId, setSellerId] = useState("acme-default");
  const [stats, setStats] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.sellers().then((d) => setSellers(d.sellers || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeAddress) {
      setStats(null);
      return;
    }
    api.stats(activeAddress).then(setStats).catch(() => setStats(null));
  }, [activeAddress]);

  const eligible = (stats?.paymentsMade ?? 0) >= 1;
  const share = result?.shortUrl || result?.shareUrl;

  async function generate() {
    setError("");
    setResult(null);
    setCopied(false);
    if (!activeAddress) {
      setError("Connect a wallet first.");
      return;
    }
    if (!signTransactions || !algodClient) {
      setError("Active wallet cannot sign transactions.");
      return;
    }
    setBusy(true);
    try {
      const prepared = await api.prepareReferral({
        referrer: activeAddress,
        sellerId,
      });
      const suggestedParams = await algodClient.getTransactionParams().do();
      const note = new TextEncoder().encode(
        prepared.noteUtf8 || prepared.clientDataString,
      );
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: activeAddress,
        amount: 0,
        note,
        suggestedParams,
      });
      const signed = await signTransactions([txn]);
      const signedTxn = signed?.[0];
      if (!signedTxn) throw new Error("Wallet cancelled signing.");
      const assembled = await api.assembleReferral({
        payload: prepared.payload,
        signedTxn: bytesToBase64(signedTxn),
      });
      setResult(assembled);
      setStats(assembled.stats || (await api.stats(activeAddress)));
      if (!assembled.eligible) {
        setError(
          assembled.note ||
            "Not eligible yet. Complete a paid call on a cycle first.",
        );
      }
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title="Referral link"
      lede="After Agent A pays through Vouch once, create a short referral link. That link carries the buyer discount for Agent B and your commission — Agent B still pays through Vouch, never the seller’s private URL."
    >
      <div className="grid items-start gap-5 lg:grid-cols-12">
        {/* Action column — single vertical flow, no empty card belly */}
        <div className="space-y-4 lg:col-span-7">
          <Bezel>
            <div className="overflow-hidden">
              {/* Identity strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/80 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    Connected agent
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[15px] font-semibold tracking-tight">
                    {activeAddress ? shortAddr(activeAddress) : "Not connected"}
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
                    eligible
                      ? "bg-ok/10 text-ok"
                      : "bg-ink/5 text-muted",
                  ].join(" ")}
                >
                  {eligible ? (
                    <CheckCircle size={14} weight="fill" />
                  ) : (
                    <WarningCircle size={14} weight="fill" />
                  )}
                  {eligible ? "Eligible" : "Need first payment"}
                </span>
              </div>

              {/* Compact metrics */}
              <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
                <div className="px-5 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    Payments
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {stats?.paymentsMade ?? 0}
                  </p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    Earnings
                  </p>
                  <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">
                    ${Number(stats?.referralEarnings || 0).toFixed(4)}
                  </p>
                </div>
              </div>

              {/* Mint controls */}
              <div className="space-y-4 px-5 py-5">
                {!activeAddress && (
                  <p className="text-[14px] font-medium text-danger">
                    Connect a wallet in the nav to continue.
                  </p>
                )}

                <label className="block text-[13px] font-medium text-muted">
                  Seller to refer
                  <select
                    className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-3 text-[14px] font-medium text-ink outline-none focus:border-ink"
                    value={sellerId}
                    onChange={(e) => setSellerId(e.target.value)}
                    disabled={!activeAddress}
                  >
                    {(sellers.length
                      ? sellers
                      : [{ id: "acme-default", name: "Acme Insights Co." }]
                    ).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </select>
                </label>

                <Btn
                  disabled={busy || !activeAddress}
                  onClick={generate}
                  className="w-full !py-3"
                  arrow
                >
                  {busy ? "Waiting for wallet…" : "Create short link"}
                </Btn>

                {!eligible && activeAddress && (
                  <p className="text-[13px] leading-relaxed text-muted">
                    You haven’t settled yet.{" "}
                    <Link to="/demo" className="font-semibold text-ink underline-offset-2 hover:underline">
                      Run a cycle
                    </Link>{" "}
                    first so this link can unlock a Vouch rebate (native) or
                    discount (plain).
                  </p>
                )}

                {error && (
                  <p className="rounded-xl bg-danger/5 px-3 py-2 text-[13px] font-medium text-danger">
                    {error}
                  </p>
                )}
              </div>

              {/* Result — only when present, fills the slip */}
              {share && (
                <div className="border-t border-line bg-ink px-5 py-5 text-white">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">
                    <LinkSimple size={14} />
                    Short link ready
                  </div>
                  <p className="mt-2 break-all font-mono text-[14px] leading-relaxed">
                    {share}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(share);
                        setCopied(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink"
                    >
                      <Copy size={14} weight="bold" />
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <Link
                      to={`/go/${result.code}`}
                      className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-[13px] font-semibold text-white no-underline"
                    >
                      Open pay page
                      <ArrowRight size={14} weight="bold" />
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
              "Settle a paid call (full price)",
              "Sign a 0 ALGO self-pay note",
              "Share the short referral link with Agent B",
            ]}
          />
          <SideInk
            kicker="What you share"
            title="A short referral link"
            body="Looks like vouch…/go/k7m2n9qx — Agent B opens it, gets the referral discount, and still pays through Vouch."
          />
        </aside>
      </div>
    </Page>
  );
}
