import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@txnlab/use-wallet-react";
import {
  ArrowRight,
  CheckCircle,
  Copy,
  WarningCircle,
} from "@phosphor-icons/react";
import { api } from "../lib/api";
import { explorerAddressUrl, explorerTxUrl } from "../lib/explorer";
import { fundSellerEscrow } from "../lib/escrow-deposit";
import { shortAddr } from "../lib/referral";
import { Bezel, Btn, Page, SideInk, SideSteps } from "../components/ui";

const ADDR_RE = /^[A-Z2-7]{58}$/;

/** Demo seller base — local in dev, hosted seller in production builds. */
const SELLER_DEMO_BASE = (
  (import.meta.env.VITE_SELLER_DEMO_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV
    ? "http://localhost:4001"
    : "https://vouch-1-wwxe.onrender.com")
).replace(/\/$/, "");

export default function Register() {
  const { activeAddress, activeWallet, signTransactions } = useWallet();
  const [mode, setMode] = useState<"plain" | "native">("native");
  const [form, setForm] = useState({
    name: "",
    endpointUrl: SELLER_DEMO_BASE,
    resourceUrl: `${SELLER_DEMO_BASE}/x402/data`,
    payoutAddress: "",
    basePriceUsdc: "0.05",
    referralDiscountPercent: "20",
    referralCommissionPercent: "8",
  });
  const [probe, setProbe] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [probing, setProbing] = useState(false);
  const [funding, setFunding] = useState(false);
  const [fundAmount, setFundAmount] = useState("1");
  const [fundResult, setFundResult] = useState<{
    txId: string;
    balanceUsdc: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    if (!activeAddress) return;
    setForm((f) =>
      f.payoutAddress ? f : { ...f, payoutAddress: activeAddress },
    );
  }, [activeAddress]);

  const payoutOk = ADDR_RE.test(form.payoutAddress.trim());

  async function runProbe() {
    setError("");
    setProbe(null);
    setProbing(true);
    try {
      const result = await api.probeSeller(form.resourceUrl.trim());
      setProbe(result);
      set("payoutAddress", result.payTo);
      set("basePriceUsdc", String(result.basePriceUsdc));
      if (!form.name.trim()) {
        set("name", "Native x402 seller");
      }
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setProbing(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setCreated(null);
    setCopied(false);

    if (!form.name.trim()) {
      setError("Seller name is required.");
      return;
    }

    if (mode === "plain") {
      if (!form.endpointUrl.trim()) {
        setError("Endpoint URL is required.");
        return;
      }
      if (!payoutOk) {
        setError("Enter a valid 58-character Algorand receiving address.");
        return;
      }
    } else if (!form.resourceUrl.trim()) {
      setError("Native x402 resource URL is required.");
      return;
    }

    setBusy(true);
    try {
      const body =
        mode === "native"
          ? {
              mode: "native",
              name: form.name.trim(),
              resourceUrl: form.resourceUrl.trim(),
              payoutAddress: form.payoutAddress.trim() || undefined,
              basePriceUsdc: Number(form.basePriceUsdc),
              referralDiscountPercent: Number(form.referralDiscountPercent),
              referralCommissionPercent: Number(
                form.referralCommissionPercent,
              ),
            }
          : {
              mode: "plain",
              name: form.name.trim(),
              endpointUrl: form.endpointUrl.trim(),
              payoutAddress: form.payoutAddress.trim(),
              basePriceUsdc: Number(form.basePriceUsdc),
              referralDiscountPercent: Number(form.referralDiscountPercent),
              referralCommissionPercent: Number(
                form.referralCommissionPercent,
              ),
            };

      const res = await api.registerSeller(body);
      if (res?.seller?.id) {
        const m = res.seller.mode === "native" ? "native" : "plain";
        localStorage.setItem(`vouch:demoSellerId:${m}`, res.seller.id);
      }
      setCreated(res);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-3 text-[14px] font-medium text-ink outline-none focus:border-ink";

  const canSubmit =
    mode === "native"
      ? Boolean(form.name.trim() && form.resourceUrl.trim() && probe?.ok)
      : Boolean(form.name.trim() && form.endpointUrl.trim() && payoutOk);

  async function fundEscrow() {
    if (!created?.seller?.id || !activeAddress || !signTransactions) {
      setError("Connect a wallet funded with Testnet USDC to deposit.");
      return;
    }
    const payTo = String(created.seller.payoutAddress || "");
    if (
      payTo &&
      activeAddress.toUpperCase() !== payTo.toUpperCase()
    ) {
      setError(
        `Connect the seller payTo wallet (${shortAddr(payTo)}) to deposit. Agent wallets cannot fund this vault.`,
      );
      return;
    }
    setFunding(true);
    setError("");
    try {
      const result = await fundSellerEscrow(
        { address: activeAddress, signTransactions },
        created.seller.id,
        Number(fundAmount),
      );
      setFundResult(result);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setFunding(false);
    }
  }

  return (
    <Page
      title="Register seller"
      lede="Put Vouch in front of your API. Core: native x402 + escrow rebate. Secondary: wrap plain Web2 and own the 402."
    >
      <div className="grid items-start gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Bezel>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/80 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    {mode === "native" ? "Core" : "Secondary"}
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold tracking-tight">
                    {mode === "native" ? "Native x402" : "Plain Web2 → x402"}
                  </p>
                  {activeWallet?.metadata?.name && activeAddress && (
                    <p className="mt-0.5 text-[12px] text-muted">
                      wallet {shortAddr(activeAddress)}
                    </p>
                  )}
                </div>
                <span
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold",
                    mode === "native" && probe
                      ? "bg-ok/10 text-ok"
                      : mode === "plain" && payoutOk
                        ? "bg-ok/10 text-ok"
                        : "bg-ink/5 text-muted",
                  ].join(" ")}
                >
                  {canSubmit ? (
                    <CheckCircle size={14} weight="fill" />
                  ) : (
                    <WarningCircle size={14} weight="fill" />
                  )}
                  {mode === "native"
                    ? probe
                      ? "Discovered"
                      : "Probe URL"
                    : payoutOk
                      ? "Ready"
                      : "Need receiving address"}
                </span>
              </div>

              <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
                <button
                  type="button"
                  onClick={() => {
                    setMode("native");
                    setError("");
                  }}
                  className={[
                    "px-5 py-4 text-left transition-colors",
                    mode === "native" ? "bg-bg" : "hover:bg-bg/60",
                  ].join(" ")}
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    Core · Native
                  </p>
                  <p className="mt-1 text-[14px] font-semibold tracking-tight">
                    Already x402
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("plain");
                    setProbe(null);
                    setError("");
                  }}
                  className={[
                    "px-5 py-4 text-left transition-colors",
                    mode === "plain" ? "bg-bg" : "hover:bg-bg/60",
                  ].join(" ")}
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    Secondary · Plain
                  </p>
                  <p className="mt-1 text-[14px] font-semibold tracking-tight">
                    Web2 → x402
                  </p>
                </button>
              </div>

              <form onSubmit={submit} className="space-y-4 px-5 py-5">
                <label className="block text-[13px] font-medium text-muted">
                  Seller name
                  <input
                    className={field}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Acme Insights Co."
                  />
                </label>

                {mode === "plain" ? (
                  <>
                    <label className="block text-[13px] font-medium text-muted">
                      Endpoint base URL
                      <input
                        className={field}
                        value={form.endpointUrl}
                        onChange={(e) => set("endpointUrl", e.target.value)}
                        placeholder={SELLER_DEMO_BASE}
                      />
                    </label>
                    <label className="block text-[13px] font-medium text-muted">
                      Receiving address (USDC payout)
                      <input
                        className={[
                          field,
                          "font-mono text-[13px]",
                          form.payoutAddress && !payoutOk
                            ? "border-danger/40"
                            : "",
                        ].join(" ")}
                        value={form.payoutAddress}
                        onChange={(e) =>
                          set(
                            "payoutAddress",
                            e.target.value.trim().toUpperCase(),
                          )
                        }
                        placeholder="58-char Algorand Testnet address"
                        spellCheck={false}
                        autoComplete="off"
                      />
                      <span className="mt-1.5 flex flex-wrap gap-x-3 text-[12px]">
                        <span className="text-muted">
                          Must be opted into USDC ASA 10458941
                        </span>
                        {activeAddress && (
                          <button
                            type="button"
                            onClick={() =>
                              set("payoutAddress", activeAddress)
                            }
                            className="font-semibold text-ink underline-offset-2 hover:underline"
                          >
                            Use connected wallet
                          </button>
                        )}
                      </span>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="block text-[13px] font-medium text-muted">
                      Native x402 resource URL
                      <input
                        className={field}
                        value={form.resourceUrl}
                        onChange={(e) => set("resourceUrl", e.target.value)}
                        placeholder={`${SELLER_DEMO_BASE}/x402/data`}
                      />
                    </label>
                    <Btn
                      type="button"
                      variant="ghost"
                      disabled={probing || !form.resourceUrl.trim()}
                      onClick={runProbe}
                      className="w-full !py-3"
                    >
                      {probing ? "Probing 402…" : "Discover payTo from 402"}
                    </Btn>
                    {probe && (
                      <div className="space-y-3 rounded-xl border border-line bg-bg px-4 py-4 text-[13px]">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                            Locked from 402
                          </p>
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ok">
                            <CheckCircle size={12} weight="fill" />
                            Discovered
                          </span>
                        </div>
                        <p>
                          payTo{" "}
                          <a
                            href={explorerAddressUrl(probe.payTo)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-signal hover:underline"
                          >
                            {shortAddr(probe.payTo)}
                          </a>
                        </p>
                        <p>
                          List{" "}
                          <span className="font-mono font-semibold text-ink">
                            ${Number(probe.basePriceUsdc).toFixed(4)}
                          </span>{" "}
                          USDC
                          {probe.asset ? (
                            <span className="text-muted">
                              {" "}
                              · ASA {probe.asset}
                            </span>
                          ) : null}
                        </p>
                        <p className="border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
                          Agents pay this full list on-chain to the seller.
                          After that, Vouch remits rebate + commission from
                          prepaid escrow — native amount verification stays
                          intact.
                        </p>
                      </div>
                    )}
                    {!probe && (
                      <p className="text-[13px] text-muted">
                        Probe first — payTo and list price lock from their 402
                        response.
                      </p>
                    )}
                  </>
                )}

                {mode === "plain" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-[13px] font-medium text-muted">
                      Base price (USDC)
                      <input
                        className={field}
                        value={form.basePriceUsdc}
                        onChange={(e) => set("basePriceUsdc", e.target.value)}
                      />
                    </label>
                    <label className="block text-[13px] font-medium text-muted">
                      Referral discount (%)
                      <input
                        className={field}
                        value={form.referralDiscountPercent}
                        onChange={(e) =>
                          set("referralDiscountPercent", e.target.value)
                        }
                      />
                    </label>
                  </div>
                )}

                {mode === "native" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-[13px] font-medium text-muted">
                      Native base (USDC)
                      <input
                        className={`${field} opacity-70`}
                        value={form.basePriceUsdc}
                        readOnly
                        disabled
                      />
                    </label>
                    <label className="block text-[13px] font-medium text-muted">
                      Buyer rebate %
                      <input
                        className={field}
                        value={form.referralDiscountPercent}
                        onChange={(e) =>
                          set("referralDiscountPercent", e.target.value)
                        }
                      />
                    </label>
                  </div>
                )}

                <label className="block text-[13px] font-medium text-muted">
                  {mode === "native"
                    ? "Referrer commission (%)"
                    : "Referral commission (%)"}
                  <input
                    className={field}
                    value={form.referralCommissionPercent}
                    onChange={(e) =>
                      set("referralCommissionPercent", e.target.value)
                    }
                  />
                </label>

                <Btn
                  type="submit"
                  disabled={busy || !canSubmit}
                  className="w-full !py-3"
                  arrow
                >
                  {busy ? "Registering…" : "Register seller"}
                </Btn>

                {error && (
                  <p className="rounded-xl bg-danger/5 px-3 py-2 text-[13px] font-medium text-danger">
                    {error}
                  </p>
                )}
              </form>

              {created && (
                <div className="border-t border-line bg-ink px-5 py-5 text-white">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">
                    Registered · {created.seller?.mode} ·{" "}
                    {created.seller?.id}
                  </p>
                  <p className="mt-2 text-[13px] text-white/70">
                    Public path (upstream stays private)
                  </p>
                  <p className="mt-1 break-all font-mono text-[13px] leading-relaxed">
                    {created.vouchPath || created.vouchUrl}
                  </p>
                  {created.seller?.payoutAddress && (
                    <p className="mt-2 text-[13px] text-white/70">
                      payTo{" "}
                      <a
                        href={explorerAddressUrl(created.seller.payoutAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[#93c5fd] hover:underline"
                      >
                        {shortAddr(created.seller.payoutAddress)}
                      </a>
                    </p>
                  )}
                  {created.seller?.mode === "native" && (
                    <div className="mt-4 space-y-3 rounded-xl border border-white/15 bg-white/5 px-3 py-3">
                      <p className="text-[12px] leading-relaxed text-white/65">
                        Fund <span className="text-white/90">this seller’s</span>{" "}
                        escrow vault with a grouped deposit (not a plain USDC
                        send). Remits debit this seller id only.
                      </p>
                      {created.escrow?.appAddress && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">
                            Escrow app · ASA receiver
                          </p>
                          <a
                            href={explorerAddressUrl(created.escrow.appAddress)}
                            target="_blank"
                            rel="noreferrer"
                            className="block break-all font-mono text-[12px] leading-relaxed text-[#93c5fd] hover:underline"
                          >
                            {created.escrow.appAddress}
                          </a>
                          <p className="font-mono text-[11px] text-white/40">
                            app {created.escrow.appId} ·{" "}
                            <button
                              type="button"
                              className="text-[#93c5fd] hover:underline"
                              onClick={async () => {
                                await navigator.clipboard.writeText(
                                  created.escrow.appAddress,
                                );
                              }}
                            >
                              Copy address
                            </button>
                          </p>
                          <p className="text-[11px] leading-relaxed text-white/45">
                            Plain sends land in the app but do{" "}
                            <span className="text-white/70">not</span> credit
                            seller <span className="font-mono">{created.seller.id}</span>
                            — use Deposit below.
                          </p>
                        </div>
                      )}
                      {created.seller?.payoutAddress && (
                        <p className="text-[12px] leading-relaxed text-white/65">
                          Deposit wallet must be payTo{" "}
                          <a
                            href={explorerAddressUrl(
                              created.seller.payoutAddress,
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[#93c5fd] hover:underline"
                          >
                            {shortAddr(created.seller.payoutAddress)}
                          </a>
                          {activeAddress &&
                            activeAddress.toUpperCase() !==
                              created.seller.payoutAddress.toUpperCase() && (
                              <span className="mt-1 block text-[12px] font-medium text-[#fca5a5]">
                                Connected {shortAddr(activeAddress)} ≠ payTo —
                                switch wallet before depositing.
                              </span>
                            )}
                        </p>
                      )}
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="block text-[12px] text-white/50">
                          USDC amount
                          <input
                            className="mt-1 w-28 rounded-lg border border-white/20 bg-ink px-2 py-2 font-mono text-[13px] text-white outline-none"
                            value={fundAmount}
                            onChange={(e) => setFundAmount(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={
                            funding ||
                            !activeAddress ||
                            (created.seller?.payoutAddress &&
                              activeAddress?.toUpperCase() !==
                                created.seller.payoutAddress.toUpperCase())
                          }
                          onClick={fundEscrow}
                          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink disabled:opacity-50"
                        >
                          {funding ? "Depositing…" : "Deposit to escrow"}
                        </button>
                      </div>
                      {fundResult && (
                        <p className="text-[13px] text-white/80">
                          Seller vault $
                          {Number(fundResult.balanceUsdc).toFixed(4)} ·{" "}
                          <a
                            href={explorerTxUrl(fundResult.txId)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[#93c5fd] hover:underline"
                          >
                            {fundResult.txId.slice(0, 12)}… (Lora)
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          created.vouchUrl || created.vouchPath,
                        );
                        setCopied(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink"
                    >
                      <Copy size={14} weight="bold" />
                      {copied ? "Copied" : "Copy Vouch path"}
                    </button>
                    <Link
                      to={`/demo/${created.seller?.mode === "native" ? "native" : "plain"}?seller=${encodeURIComponent(created.seller?.id || "")}`}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink no-underline"
                    >
                      Run{" "}
                      {created.seller?.mode === "native" ? "native" : "plain"}{" "}
                      cycle
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
            title={mode === "plain" ? "Plain cycle" : "Native cycle"}
            items={
              mode === "plain"
                ? [
                    "Point at your private HTTP API",
                    "Set receiving address + base price",
                    "Vouch owns 402 — discount at pay time",
                  ]
                : [
                    "Probe native x402 (payTo + list locked)",
                    "Prepaid USDC into Vouch escrow",
                    "Agents hit Vouch, pay seller full · Vouch remits",
                  ]
            }
          />
          <SideInk
            kicker={mode === "plain" ? "Secondary" : "Core"}
            title={
              mode === "plain" ? (
                <>
                  Client → <span className="text-[#93c5fd]">Vouch</span> → API
                </>
              ) : (
                <>
                  Client → <span className="text-[#93c5fd]">Vouch</span> → seller
                </>
              )
            }
            body={
              mode === "plain"
                ? "Upstream stays private. Agents only use Vouch pay links and short referral links that carry the discount — never the seller API URL."
                : "Vouch is still the middle layer on native. Agents pay seller list price; Vouch remits rebate + commission from escrow."
            }
          />
        </aside>
      </div>
    </Page>
  );
}
