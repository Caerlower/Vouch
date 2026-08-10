import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useWallet } from "@txnlab/use-wallet-react";
import algosdk from "algosdk";
import {
  ArrowRight,
  CheckCircle,
  Copy,
  WarningCircle,
} from "@phosphor-icons/react";
import { api } from "../lib/api";
import { payResource } from "../lib/pay";
import {
  explorerAddressUrl,
  explorerAssetUrl,
  explorerTxUrl,
  USDC_TESTNET_ASA,
  normalizeTxId,
} from "../lib/explorer";
import { bytesToBase64, shortAddr } from "../lib/referral";
import { Bezel, Btn, Page, SideInk } from "../components/ui";

const STEPS_NATIVE = [
  { id: "a-pay", title: "Agent A pays", blurb: "Full list price — USDC to the seller wallet." },
  { id: "a-refer", title: "Agent A shares link", blurb: "Sign once to create a referral link that carries the discount." },
  { id: "b-switch", title: "Switch to Agent B", blurb: "Disconnect Agent A and connect a different wallet." },
  { id: "b-pay", title: "Agent B gets discount", blurb: "Pays full list to the seller. Vouch remits the discount rebate + Agent A’s commission." },
  { id: "proof", title: "Proof", blurb: "This cycle’s payments, rebate, and commission on Lora." },
];

const STEPS_PLAIN = [
  { id: "a-pay", title: "Agent A pays", blurb: "Full price through Vouch — real Testnet USDC." },
  { id: "a-refer", title: "Agent A shares link", blurb: "Sign once to create a referral link that carries the discount." },
  { id: "b-switch", title: "Switch to Agent B", blurb: "Disconnect Agent A and connect a different wallet." },
  { id: "b-pay", title: "Agent B gets discount", blurb: "Pays the discounted quote — cheaper up front." },
  { id: "proof", title: "Proof", blurb: "This cycle’s payments and Agent A’s commission on Lora." },
];

const SELLER_STORAGE_KEY = "vouch:demoSellerId";

export default function LiveDemo() {
  const { mode: modeParam } = useParams();
  const cycleMode = modeParam === "plain" ? "plain" : modeParam === "native" ? "native" : null;
  const STEPS = cycleMode === "plain" ? STEPS_PLAIN : STEPS_NATIVE;

  const { activeAddress, signTransactions, algodClient, activeWallet } =
    useWallet();
  const [searchParams, setSearchParams] = useSearchParams();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState<Array<{ t: string; line: string }>>([]);
  const [sellerId, setSellerId] = useState("acme-default");
  const [sellers, setSellers] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [agentA, setAgentA] = useState<string | null>(null);
  const [payA, setPayA] = useState<any>(null);
  const [referTxId, setReferTxId] = useState<string | null>(null);
  const [shortUrl, setShortUrl] = useState("");
  const [refCode, setRefCode] = useState("");
  const [quoteFull, setQuoteFull] = useState<any>(null);
  const [quoteRef, setQuoteRef] = useState<any>(null);
  const [agentB, setAgentB] = useState<string | null>(null);
  const [payB, setPayB] = useState<any>(null);
  const [remitResult, setRemitResult] = useState<any>(null);
  const [escrowInfo, setEscrowInfo] = useState<any>(null);
  const [statsA, setStatsA] = useState<any>(null);
  const [ledger, setLedger] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [
      { t: new Date().toLocaleTimeString(), line },
      ...prev.slice(0, 50),
    ]);
  }, []);

  const refreshSellers = useCallback(async () => {
    try {
      const d = await api.sellers();
      setSellers(d.sellers || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    api.health().then(setHealth).catch(() => {});
    refreshSellers();
    const onFocus = () => refreshSellers();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshSellers]);

  const modeSellers = useMemo(
    () =>
      sellers.filter((s) =>
        cycleMode === "native" ? s.mode === "native" : s.mode !== "native",
      ),
    [sellers, cycleMode],
  );

  useEffect(() => {
    if (cycleMode !== "native" || !sellerId) {
      setEscrowInfo(null);
      return;
    }
    // Avoid racing the initial "acme-default" state before native seller is chosen.
    if (!modeSellers.some((s) => s.id === sellerId)) {
      return;
    }
    let cancelled = false;
    api
      .escrow(sellerId)
      .then((info) => {
        if (!cancelled) setEscrowInfo(info);
      })
      .catch(() => {
        if (!cancelled) setEscrowInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cycleMode, sellerId, step, modeSellers]);

  // Prefer ?seller=…, then last used, then first seller in this cycle
  useEffect(() => {
    const fromUrl = searchParams.get("seller");
    const fromStorage = localStorage.getItem(`${SELLER_STORAGE_KEY}:${cycleMode}`);
    const preferred = fromUrl || fromStorage;
    if (modeSellers.length === 0) {
      if (cycleMode === "plain") setSellerId("acme-default");
      return;
    }
    const exists = preferred && modeSellers.some((s) => s.id === preferred);
    setSellerId(exists ? preferred! : modeSellers[0].id);
  }, [modeSellers, searchParams, cycleMode]);

  const selectedSeller = useMemo(
    () => modeSellers.find((s) => s.id === sellerId) || null,
    [modeSellers, sellerId],
  );

  function chooseSeller(id: string) {
    setSellerId(id);
    localStorage.setItem(`${SELLER_STORAGE_KEY}:${cycleMode}`, id);
    const next = new URLSearchParams(searchParams);
    next.set("seller", id);
    setSearchParams(next, { replace: true });
  }

  const current = STEPS[step];

  async function agentAPay() {
    if (!activeAddress || !signTransactions) {
      setError("Connect Agent A’s wallet first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const quote = await api.quote(null, sellerId);
      setQuoteFull(quote);
      pushLog(`Quote (no ref) on ${sellerId}: $${quote.price} USDC`);
      const result = await payResource({
        address: activeAddress,
        signTransactions,
        sellerId,
        ref: null,
      });
      setAgentA(activeAddress);
      setPayA(result);
      // Seller forward happens in onAfterSettle — give it a beat, then refresh ledger
      await new Promise((r) => setTimeout(r, 1200));
      try {
        setLedger(await api.ledger());
      } catch {
        /* ignore */
      }
      pushLog(
        `Agent A paid · ${shortAddr(activeAddress)}` +
          (result.txId && explorerTxUrl(result.txId)
            ? ` · ${explorerTxUrl(result.txId)}`
            : result.txId
              ? ` · ${result.txId.slice(0, 10)}…`
              : ""),
      );
      setStep(1);
    } catch (err: any) {
      setError(humanPayError(err));
      pushLog(`Error: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  async function agentARefer() {
    if (!activeAddress || !signTransactions || !algodClient) {
      setError("Connect Agent A’s wallet.");
      return;
    }
    if (agentA && activeAddress !== agentA) {
      setError(
        `Need Agent A (${shortAddr(agentA)}). Connected: ${shortAddr(activeAddress)}`,
      );
      return;
    }
    setBusy(true);
    setError("");
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
      if (!assembled.eligible) {
        throw new Error(
          assembled.note ||
            "Not eligible yet — Agent A must complete a paid call first.",
        );
      }

      // Broadcast the 0 ALGO auth txn so the referral has an explorer link
      let mintedTxId = null;
      try {
        const { txid } = await algodClient
          .sendRawTransaction(signedTxn)
          .do();
        mintedTxId = txid;
        await algosdk.waitForConfirmation(algodClient, txid, 4);
        pushLog(
          `Referral auth tx confirmed · ${explorerTxUrl(txid) || txid}`,
        );
      } catch (broadcastErr: any) {
        pushLog(
          `Referral link minted (auth tx not confirmed): ${broadcastErr.message || broadcastErr}`,
        );
      }

      setAgentA(activeAddress);
      setReferTxId(mintedTxId);
      setShortUrl(assembled.shortUrl || assembled.shareUrl);
      setRefCode(assembled.code);
      const q = await api.quote(assembled.code, sellerId);
      setQuoteRef(q);
      pushLog(`Short referral ready: ${assembled.shortUrl || assembled.shareUrl}`);
      setStep(2);
    } catch (err: any) {
      setError(err.message || String(err));
      pushLog(`Error: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  function confirmAgentB() {
    setError("");
    if (!activeAddress) {
      setError("Connect Agent B’s wallet.");
      return;
    }
    if (agentA && activeAddress === agentA) {
      setError("Still Agent A. Disconnect and connect a different wallet.");
      return;
    }
    setAgentB(activeAddress);
    pushLog(`Agent B ready: ${shortAddr(activeAddress)}`);
    setStep(3);
  }

  async function agentBPay() {
    if (!activeAddress || !signTransactions) {
      setError("Connect Agent B’s wallet.");
      return;
    }
    if (agentA && activeAddress === agentA) {
      setError("Agent B must be a different wallet than Agent A.");
      return;
    }
    if (!refCode) {
      setError("Create a referral link in step 2 first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const quote = await api.quote(refCode, sellerId);
      setQuoteRef(quote);
      const native = quote.sellerMode === "native";
      if (!native && !quote.discountApplied) {
        throw new Error(`Discount not applied: ${quote.referralReason}`);
      }
      if (native && !quote.referralEligible) {
        throw new Error(`Referral not eligible for remit: ${quote.referralReason}`);
      }
      const result = await payResource({
        address: activeAddress,
        signTransactions,
        sellerId,
        ref: refCode,
      });
      setAgentB(activeAddress);
      setPayB(result);
      pushLog(
        native
          ? `Agent B paid full $${quote.price} to seller · Vouch will remit rebate $${Number(quote.remitRebateUsdc || 0).toFixed(4)}`
          : `Agent B paid discounted $${quote.price}`,
      );
      if (native && result.txId) {
        try {
          // Remit runs in onAfterSettle — poll lookup endpoint
          const remit = await api.waitForRemit(result.txId);
          setRemitResult(remit);
          const entry = remit.remit || remit;
          const appCall = entry?.appCallTxId || "";
          const rebateTx = entry?.rebateTxId || appCall;
          const commissionTx = entry?.commissionTxId || "";
          const rebateUrl = explorerTxUrl(rebateTx || appCall);
          const commissionUrl = explorerTxUrl(commissionTx || appCall);
          const appUrl = explorerTxUrl(appCall);
          pushLog(
            remit.already
              ? `Vouch escrow remit already applied${appUrl ? ` · ${appUrl}` : ""}`
              : `Vouch remitted rebate $${Number(entry?.rebateUsdc || quote.remitRebateUsdc || 0).toFixed(4)} to Agent B` +
                  (rebateUrl ? ` · ${rebateUrl}` : "") +
                  (Number(entry?.commissionUsdc || 0) > 0
                    ? ` · commission $${Number(entry.commissionUsdc).toFixed(4)} to Agent A` +
                      (commissionUrl ? ` · ${commissionUrl}` : "")
                    : ""),
          );
        } catch (remitErr: any) {
          pushLog(
            `Vouch remit pending/failed: ${remitErr.message || remitErr} (check escrow funding for seller ${sellerId})`,
          );
        }
      }
      await new Promise((r) => setTimeout(r, 800));
      if (agentA) setStatsA(await api.stats(agentA));
      setLedger(await api.ledger());
      setStep(4);
    } catch (err: any) {
      setError(humanPayError(err));
      pushLog(`Error: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(0);
    setError("");
    setLog([]);
    setAgentA(null);
    setPayA(null);
    setReferTxId(null);
    setShortUrl("");
    setRefCode("");
    setQuoteFull(null);
    setQuoteRef(null);
    setAgentB(null);
    setPayB(null);
    setRemitResult(null);
    setStatsA(null);
    setLedger(null);
    setCopied(false);
  }

  const price = Number(
    quoteFull?.price ??
      selectedSeller?.basePriceUsdc ??
      health?.basePriceUsdc ??
      0.05,
  ).toFixed(4);

  const proxyPath = `/r/${sellerId}/resource`;
  const showShortBand = Boolean(shortUrl) && step > 0 && step < 4;

  const remit = remitResult?.remit ?? null;
  const cycleCommission = Number(
    remit?.commissionUsdc ?? quoteRef?.remitCommissionUsdc ?? quoteRef?.commissionUsdc ?? 0,
  );
  const cycleRebate = Number(
    remit?.rebateUsdc ?? quoteRef?.remitRebateUsdc ?? 0,
  );
  const cycleSellerReceived = Number(
    (payA ? Number(quoteFull?.price ?? price) : 0) +
      (payB ? Number(quoteRef?.price ?? 0) : 0),
  );

  if (!cycleMode) {
    return <Navigate to="/demo" replace />;
  }

  return (
    <Page
      title={cycleMode === "native" ? "Native cycle" : "Plain cycle"}
      lede={
        cycleMode === "native"
          ? "Product: a referral discount. Agent A shares a link. Agent B pays the seller the full list price; Vouch remits the discount rebate to Agent B and commission to Agent A from escrow."
          : "Product: a referral discount. Agent A shares a link. Agent B pays a cheaper quote through Vouch — the seller API stays hidden."
      }
      actions={
        <Link
          to="/demo"
          className="text-[13px] font-semibold text-muted no-underline hover:text-ink"
        >
          All cycles
        </Link>
      }
    >
      <div className="grid items-start gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Bezel>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/80 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    Connected wallet
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
                      {agentA && activeAddress === agentA
                        ? " · Agent A"
                        : agentB && activeAddress === agentB
                          ? " · Agent B"
                          : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold",
                      activeAddress ? "bg-ok/10 text-ok" : "bg-ink/5 text-muted",
                    ].join(" ")}
                  >
                    {activeAddress ? (
                      <CheckCircle size={14} weight="fill" />
                    ) : (
                      <WarningCircle size={14} weight="fill" />
                    )}
                    Step {step + 1}/{STEPS.length}
                  </span>
                  <button
                    type="button"
                    onClick={reset}
                    disabled={busy}
                    className="rounded-full border border-line px-3 py-1 text-[12px] font-semibold text-muted hover:border-ink hover:text-ink"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
                <div className="px-5 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    Quote
                  </p>
                  <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">
                    ${step >= 3 && quoteRef ? Number(quoteRef.price).toFixed(4) : price}
                  </p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    Seller
                  </p>
                  <select
                    className="mt-1 w-full bg-transparent text-[15px] font-semibold tracking-tight outline-none"
                    value={sellerId}
                    onChange={(e) => chooseSeller(e.target.value)}
                    disabled={busy || step > 0}
                  >
                    {(modeSellers.length
                      ? modeSellers
                      : cycleMode === "plain"
                        ? [{ id: "acme-default", name: "Acme", mode: "plain" }]
                        : []
                    ).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name ? `${s.name} (${s.id})` : s.id}
                      </option>
                    ))}
                  </select>
                  {cycleMode === "native" && modeSellers.length === 0 && (
                    <p className="mt-1 text-[12px] text-danger">
                      No native sellers yet.{" "}
                      <Link to="/register" className="font-semibold underline">
                        Register one
                      </Link>
                    </p>
                  )}
                </div>
              </div>

              {step === 0 && (
                <div className="space-y-2 border-b border-line bg-bg/60 px-5 py-3 text-[12px]">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                    <span>
                      Vouch pay link{" "}
                      <span className="font-mono text-ink">{proxyPath}</span>
                    </span>
                    <span className="text-line">·</span>
                    <span className="font-semibold text-ink">
                      {cycleMode === "native"
                        ? "Agent B discount = escrow rebate"
                        : "Agent B discount = cheaper quote"}
                    </span>
                    <span className="text-line">·</span>
                    <Link to="/register" className="font-semibold text-ink">
                      Register
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        refreshSellers();
                        if (cycleMode === "native" && sellerId) {
                          api
                            .escrow(sellerId)
                            .then(setEscrowInfo)
                            .catch(() => setEscrowInfo(null));
                        }
                      }}
                      className="font-semibold text-ink"
                    >
                      Refresh
                    </button>
                  </div>
                  {cycleMode === "native" && escrowInfo && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span
                        className={[
                          "font-mono font-semibold tabular-nums",
                          Number(escrowInfo.balanceUsdc || 0) > 0
                            ? "text-ok"
                            : "text-danger",
                        ].join(" ")}
                      >
                        Escrow ${Number(escrowInfo.balanceUsdc || 0).toFixed(4)}
                      </span>
                      <span className="text-muted">
                        for {sellerId}
                        {escrowInfo.appId ? ` · app ${escrowInfo.appId}` : ""}
                      </span>
                      {Number(escrowInfo.balanceUsdc || 0) <= 0 ? (
                        <span className="font-medium text-danger">
                          Fund with the seller payTo wallet on Register
                        </span>
                      ) : (
                        <span className="text-muted">
                          Remits spend this balance (~$0.014 per Agent B cycle)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4 px-5 py-5">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-signal">
                    {String(step + 1).padStart(2, "0")} · {current.title}
                  </p>
                  <p className="mt-1 text-[14px] text-muted">{current.blurb}</p>
                </div>

                {!activeAddress && (
                  <p className="text-[14px] font-medium text-danger">
                    Connect a wallet in the nav to continue.
                  </p>
                )}

                {step === 0 && (
                  <>
                    <p className="text-[13px] text-muted">
                      x402 pays seller directly{" "}
                      {selectedSeller?.payoutAddress || health?.sellerPayoutAddress ? (
                        <a
                          href={explorerAddressUrl(
                            selectedSeller?.payoutAddress ||
                              health?.sellerPayoutAddress,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-signal hover:underline"
                        >
                          {shortAddr(
                            selectedSeller?.payoutAddress ||
                              health?.sellerPayoutAddress,
                          )}
                        </a>
                      ) : (
                        <span className="font-mono text-ink">—</span>
                      )}
                      {" · "}
                      <a
                        href={explorerAssetUrl(USDC_TESTNET_ASA)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-signal hover:underline"
                      >
                        USDC ASA {USDC_TESTNET_ASA}
                      </a>
                    </p>
                    <Btn
                      disabled={busy || !activeAddress}
                      onClick={agentAPay}
                      className="w-full !py-3"
                      arrow
                    >
                      {busy ? "Waiting for wallet…" : "Pay full price"}
                    </Btn>
                  </>
                )}

                {step === 1 && (
                  <Btn
                    disabled={busy || !activeAddress}
                    onClick={agentARefer}
                    className="w-full !py-3"
                    arrow
                  >
                    {busy ? "Sign in wallet…" : "Create short referral"}
                  </Btn>
                )}

                {step === 2 && (
                  <>
                    <p className="rounded-xl bg-bg px-3 py-2 font-mono text-[13px]">
                      A locked:{" "}
                      <a
                        href={explorerAddressUrl(agentA)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-signal hover:underline"
                      >
                        {shortAddr(agentA)}
                      </a>
                      <br />
                      Now:{" "}
                      {activeAddress ? (
                        <a
                          href={explorerAddressUrl(activeAddress)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-signal hover:underline"
                        >
                          {shortAddr(activeAddress)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </p>
                    <Btn
                      disabled={busy || !activeAddress}
                      onClick={confirmAgentB}
                      className="w-full !py-3"
                      arrow
                    >
                      Confirm Agent B
                    </Btn>
                  </>
                )}

                {step === 3 && (
                  <>
                    <p className="text-[13px] text-muted">
                      ref{" "}
                      <span className="font-mono text-ink">{refCode}</span>
                      {shortUrl && (
                        <>
                          {" · "}
                          <a
                            href={shortUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-signal hover:underline"
                          >
                            open short link
                          </a>
                        </>
                      )}
                    </p>
                    <Btn
                      disabled={busy || !activeAddress}
                      onClick={agentBPay}
                      className="w-full !py-3"
                      arrow
                    >
                      {busy ? "Paying…" : "Pay with referral"}
                    </Btn>
                  </>
                )}

                {step === 4 && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
                      <div>
                        <p className="text-[13px] text-muted">
                          {cycleMode === "native"
                            ? "Agent B paid the seller; Vouch remitted rebate + commission from escrow."
                            : "Both agents paid through Vouch; Agent B’s quote carried the discount."}
                        </p>
                      </div>
                      <div className="flex gap-6 text-right">
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                            Agent A earned
                          </p>
                          <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                            ${cycleCommission.toFixed(4)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                            {cycleMode === "native"
                              ? "Seller this cycle"
                              : "Paid this cycle"}
                          </p>
                          <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                            ${cycleSellerReceived.toFixed(4)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <ul className="m-0 list-none divide-y divide-line border-y border-line p-0">
                      <ProofRow
                        label="Agent A payment"
                        amount={`$${Number(quoteFull?.price ?? price).toFixed(4)}`}
                        txId={payA?.txId}
                      />
                      <ProofRow
                        label="Referral auth"
                        txId={referTxId}
                      />
                      <ProofRow
                        label="Agent B payment"
                        amount={
                          quoteRef
                            ? cycleMode === "native"
                              ? `Full $${Number(quoteRef.price).toFixed(4)}`
                              : `Discounted $${Number(quoteRef.price).toFixed(4)}`
                            : undefined
                        }
                        txId={payB?.txId}
                      />
                      {cycleMode === "native" && (
                        <>
                          <ProofRow
                            label="Buyer rebate → Agent B"
                            amount={
                              cycleRebate > 0
                                ? `$${cycleRebate.toFixed(4)}`
                                : undefined
                            }
                            detail={
                              remit?.payer
                                ? shortAddr(remit.payer)
                                : agentB
                                  ? shortAddr(agentB)
                                  : undefined
                            }
                            account={remit?.payer || agentB}
                            txId={
                              remit?.rebateTxId || remit?.appCallTxId || null
                            }
                            missing={
                              payB?.txId && !remit
                                ? "Pending — fund seller escrow with payTo wallet, then re-run Agent B"
                                : undefined
                            }
                          />
                          {cycleCommission > 0 && (
                            <ProofRow
                              label="Commission → Agent A"
                              amount={`$${cycleCommission.toFixed(4)}`}
                              detail={
                                remit?.referrer
                                  ? shortAddr(remit.referrer)
                                  : agentA
                                    ? shortAddr(agentA)
                                    : undefined
                              }
                              account={remit?.referrer || agentA}
                              txId={
                                remit?.commissionTxId ||
                                remit?.appCallTxId ||
                                null
                              }
                            />
                          )}
                        </>
                      )}
                      {cycleMode === "plain" && cycleCommission > 0 && (
                        <ProofRow
                          label="Commission → Agent A"
                          amount={`$${cycleCommission.toFixed(4)}`}
                          detail={agentA ? shortAddr(agentA) : undefined}
                          account={agentA}
                        />
                      )}
                    </ul>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                      {agentA && (
                        <a
                          href={explorerAddressUrl(agentA)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-signal hover:underline"
                        >
                          Agent A on Lora
                        </a>
                      )}
                      {agentB && (
                        <a
                          href={explorerAddressUrl(agentB)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-signal hover:underline"
                        >
                          Agent B on Lora
                        </a>
                      )}
                      {selectedSeller?.payoutAddress && (
                        <a
                          href={explorerAddressUrl(selectedSeller.payoutAddress)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-signal hover:underline"
                        >
                          Seller on Lora
                        </a>
                      )}
                      <span className="text-line">·</span>
                      <a
                        href={explorerAssetUrl(USDC_TESTNET_ASA)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted hover:text-ink hover:underline"
                      >
                        USDC ASA {USDC_TESTNET_ASA}
                      </a>
                      {agentA && (
                        <>
                          <span className="text-line">·</span>
                          <Link
                            to={`/ledger?address=${encodeURIComponent(agentA)}`}
                            className="text-muted hover:text-ink"
                          >
                            In-app ledger
                          </Link>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Btn type="button" onClick={reset} className="!py-2.5">
                        Run again
                      </Btn>
                      <Link
                        to="/register"
                        className="inline-flex items-center rounded-full border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-ink hover:bg-bg"
                      >
                        Fund escrow
                      </Link>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="rounded-xl bg-danger/5 px-3 py-2 text-[13px] font-medium text-danger">
                    {error}
                  </p>
                )}
              </div>

              {showShortBand && (
                <div className="border-t border-line bg-ink px-5 py-5 text-white">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">
                    Short referral
                  </p>
                  <p className="mt-3 break-all font-mono text-[13px]">
                    {shortUrl}
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(shortUrl);
                      setCopied(true);
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink"
                  >
                    <Copy size={14} weight="bold" />
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
              )}

              {step < 4 && (
                <div className="border-t border-line bg-bg">
                  <div className="flex items-center justify-between gap-3 px-5 py-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                      Activity
                    </p>
                    {log.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setLog([])}
                        className="text-[11px] font-semibold text-muted hover:text-ink"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <ul className="m-0 max-h-40 list-none overflow-auto border-t border-line p-0">
                    {log.length === 0 ? (
                      <li className="px-5 py-3 text-[13px] text-muted">
                        Actions will show here as you run the cycle.
                      </li>
                    ) : (
                      log.slice(0, 10).map((e, i) => {
                        const isErr = /^Error:/i.test(e.line);
                        return (
                          <li
                            key={`${e.t}-${i}`}
                            className={[
                              "grid grid-cols-[6.5rem_1fr] gap-3 border-b border-line px-5 py-2.5 text-[12px] last:border-b-0",
                              isErr ? "bg-danger/[0.04]" : "",
                            ].join(" ")}
                          >
                            <time className="font-mono text-muted tabular-nums">
                              {e.t}
                            </time>
                            <span
                              className={[
                                "leading-snug break-all",
                                isErr
                                  ? "font-medium text-danger"
                                  : "text-ink",
                              ].join(" ")}
                            >
                              <LogLine text={e.line} />
                            </span>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              )}
            </div>
          </Bezel>
        </div>

        <aside className="space-y-3 lg:col-span-5">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Steps
            </p>
            <ol className="mt-4 space-y-0">
              {STEPS.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStep(i)}
                    className={[
                      "flex w-full gap-3 border-b border-line py-3 text-left last:border-0",
                      i === step ? "opacity-100" : i < step ? "opacity-80" : "opacity-45",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "font-mono text-[12px] font-medium",
                        i === step ? "text-signal" : "text-muted",
                      ].join(" ")}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={[
                        "text-[14px] font-medium leading-snug",
                        i === step ? "text-ink" : "text-muted",
                      ].join(" ")}
                    >
                      {s.title}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <SideInk
            kicker={cycleMode === "native" ? "Core" : "Secondary"}
            title={
              cycleMode === "native" ? (
                <>
                  Agent B discount · <span className="text-[#93c5fd]">escrow rebate</span>
                </>
              ) : (
                <>
                  Agent B discount · <span className="text-[#93c5fd]">cheaper quote</span>
                </>
              )
            }
            body={
              cycleMode === "native"
                ? `Agent → Vouch → seller · Agent B discount via escrow rebate · Agent A commission · ${health?.facilitator || "GoPlausible"} · USDC ASA ${USDC_TESTNET_ASA}`
                : `Agent → Vouch → private API · Agent B discount in quote · Agent A commission · ${health?.facilitator || "GoPlausible"} · USDC ASA ${USDC_TESTNET_ASA}`
            }
          />
        </aside>
      </div>
    </Page>
  );
}

function LogLine({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-signal hover:underline"
          >
            {part.includes("lora.algokit.io")
              ? `${part.replace(/^https?:\/\/lora\.algokit\.io\/testnet\/transaction\//, "").slice(0, 16)}… (Lora)`
              : part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function ProofRow({
  label,
  amount,
  detail,
  account,
  txId,
  missing,
}: {
  label: string;
  amount?: string;
  detail?: string;
  account?: string | null;
  txId?: string | null;
  missing?: string;
}) {
  const url = explorerTxUrl(txId);
  const short = txId ? (normalizeTxId(txId) || txId).slice(0, 12) : null;
  const accountUrl = explorerAddressUrl(account);

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-ink">{label}</p>
        {(detail || accountUrl) && (
          <p className="mt-0.5 text-[12px] text-muted">
            {accountUrl ? (
              <a
                href={accountUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-signal hover:underline"
              >
                {detail || shortAddr(account)}
              </a>
            ) : (
              detail
            )}
          </p>
        )}
        {missing && (
          <p className="mt-1 text-[12px] font-medium text-danger">{missing}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-right">
        {amount && (
          <span className="font-mono text-[14px] font-semibold tabular-nums text-ink">
            {amount}
          </span>
        )}
        {url && short ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[12px] font-semibold text-signal hover:underline"
          >
            {short}…
            <ArrowRight size={12} weight="bold" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

function humanPayError(err: any) {
  const msg = err?.message || String(err);
  if (/opt.?in|asset/i.test(msg)) {
    return `${msg} — opt into USDC ASA 10458941, then retry.`;
  }
  if (/insufficient|balance/i.test(msg)) {
    return `${msg} — fund with Testnet ALGO + USDC.`;
  }
  return msg;
}
