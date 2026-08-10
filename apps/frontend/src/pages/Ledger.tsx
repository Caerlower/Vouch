import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowClockwise,
  ArrowRight,
  CaretLeft,
} from "@phosphor-icons/react";
import { api } from "../lib/api";
import {
  explorerAddressUrl,
  explorerTxUrl,
} from "../lib/explorer";
import { shortAddr } from "../lib/referral";
import { Bezel, Btn, Page, SideInk, SideSteps } from "../components/ui";

export default function Ledger() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = searchParams.get("address") || null;

  async function load() {
    setError("");
    setBusy(true);
    try {
      setData(await api.ledger());
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const accounts = useMemo(
    () =>
      data?.accounts
        ? (Object.entries(data.accounts) as Array<[string, any]>)
        : [],
    [data],
  );

  const selectedAcct = selected && data?.accounts?.[selected]
    ? data.accounts[selected]
    : null;

  const history = useMemo(() => {
    if (!selectedAcct?.history) return [];
    return [...selectedAcct.history].reverse();
  }, [selectedAcct]);

  const payoutHits = useMemo(() => {
    if (!selected || !data?.payouts) return [];
    const seller = (data.payouts.seller?.entries || []).filter(
      (e: any) => e.payoutAddress === selected,
    );
    const referrer = (data.payouts.referrers?.entries || []).filter(
      (e: any) => e.address === selected,
    );
    return [...seller, ...referrer].sort((a, b) =>
      String(b.timestamp || "").localeCompare(String(a.timestamp || "")),
    );
  }, [data, selected]);

  function openAgent(addr: string) {
    const next = new URLSearchParams(searchParams);
    next.set("address", addr);
    setSearchParams(next);
  }

  function clearAgent() {
    const next = new URLSearchParams(searchParams);
    next.delete("address");
    setSearchParams(next);
  }

  return (
    <Page
      title="Ledger"
      lede="In-memory settlement state after on-chain payments — click an agent to see their history."
    >
      <div className="grid items-start gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Bezel>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/80 px-5 py-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    {selected ? "Agent detail" : "Settlement state"}
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold tracking-tight">
                    {selected ? (
                      <a
                        href={explorerAddressUrl(selected)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono hover:underline"
                      >
                        {shortAddr(selected)}
                      </a>
                    ) : accounts.length ? (
                      `${accounts.length} account${accounts.length === 1 ? "" : "s"}`
                    ) : (
                      "No settlements yet"
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selected && (
                    <button
                      type="button"
                      onClick={clearAgent}
                      className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:border-ink hover:text-ink"
                    >
                      <CaretLeft size={12} weight="bold" />
                      All agents
                    </button>
                  )}
                  <Btn
                    variant="ghost"
                    onClick={load}
                    disabled={busy}
                    className="!h-9 !px-3.5 !py-0 !text-[13px]"
                  >
                    <ArrowClockwise
                      size={14}
                      weight="bold"
                      className="shrink-0"
                    />
                    <span>{busy ? "…" : "Refresh"}</span>
                  </Btn>
                </div>
              </div>

              {!selected && (
                <div className="grid grid-cols-2 divide-x divide-line border-b border-line sm:grid-cols-4">
                  {[
                    ["Accounts", data?.totals?.accountCount ?? 0],
                    [
                      "Seller $",
                      Number(
                        data?.payouts?.seller?.receivedUsdc ||
                          data?.payouts?.seller?.forwardedUsdc ||
                          0,
                      ).toFixed(4),
                    ],
                    [
                      "Referrer $",
                      Number(data?.totals?.referrerPendingUsdc || 0).toFixed(4),
                    ],
                    ["Nonces", data?.usedNonceCount ?? 0],
                  ].map(([label, value]) => (
                    <div key={label} className="px-4 py-4 sm:px-5">
                      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                        {label}
                      </p>
                      <p className="mt-1 font-mono text-xl font-semibold tracking-tight">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {selected && selectedAcct && (
                <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
                  <div className="px-5 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                      Payments
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">
                      {selectedAcct.paymentsMade}
                    </p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                      Earnings
                    </p>
                    <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">
                      $
                      {Number(selectedAcct.referralEarnings || 0).toFixed(4)}
                    </p>
                  </div>
                </div>
              )}

              <div className="px-5 py-5">
                {error && (
                  <p className="mb-4 rounded-xl bg-danger/5 px-3 py-2 text-[13px] font-medium text-danger">
                    {error}
                  </p>
                )}

                {!selected && (
                  <div className="overflow-auto">
                    <table className="w-full text-left text-[14px]">
                      <thead>
                        <tr className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                          <th className="border-b border-line pb-3 font-medium">
                            Agent
                          </th>
                          <th className="border-b border-line pb-3 font-medium">
                            Payments
                          </th>
                          <th className="border-b border-line pb-3 text-right font-medium">
                            Earnings
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {accounts.length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              className="py-8 text-center text-muted"
                            >
                              No settlements yet.{" "}
                              <Link
                                to="/demo"
                                className="font-semibold text-ink underline-offset-2 hover:underline"
                              >
                                Run a cycle
                              </Link>
                            </td>
                          </tr>
                        )}
                        {accounts.map(([addr, acct]) => (
                          <tr key={addr}>
                            <td className="border-b border-line py-3">
                              <button
                                type="button"
                                onClick={() => openAgent(addr)}
                                className="font-mono text-[13px] font-semibold text-ink hover:text-signal"
                              >
                                {shortAddr(addr)}
                              </button>
                            </td>
                            <td className="border-b border-line py-3">
                              {acct.paymentsMade}
                            </td>
                            <td className="border-b border-line py-3 text-right font-mono text-[13px]">
                              $
                              {Number(acct.referralEarnings || 0).toFixed(4)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {accounts.length > 0 && (
                      <p className="mt-3 text-[12px] text-muted">
                        Click an agent to inspect payments, commissions, and tx
                        links.
                      </p>
                    )}
                  </div>
                )}

                {selected && !selectedAcct && (
                  <p className="text-[14px] text-muted">
                    No ledger history for this address yet.
                  </p>
                )}

                {selected && selectedAcct && (
                  <div className="flex max-h-[min(28rem,55vh)] flex-col overflow-hidden rounded-xl border border-line bg-bg/40">
                    <div className="shrink-0 border-b border-line px-4 py-3">
                      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                        Activity
                        <span className="ml-2 normal-case tracking-normal text-ink/50">
                          {history.length + payoutHits.length} entries
                        </span>
                      </p>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
                      <ul className="m-0 list-none space-y-0 p-0">
                        {history.length === 0 && payoutHits.length === 0 && (
                          <li className="py-6 text-[13px] text-muted">
                            No activity recorded.
                          </li>
                        )}
                        {history.map((entry, i) => (
                          <HistoryRow
                            key={`${entry.timestamp}-${i}`}
                            entry={entry}
                          />
                        ))}
                        {payoutHits.length > 0 && (
                          <>
                            <li className="sticky top-0 z-10 border-b border-line bg-bg/95 py-2.5 backdrop-blur-sm">
                              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                                Split credits
                              </p>
                            </li>
                            {payoutHits.map((entry, i) => (
                              <HistoryRow
                                key={`payout-${entry.timestamp}-${i}`}
                                entry={entry}
                              />
                            ))}
                          </>
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Bezel>
        </div>

        <aside className="space-y-3 lg:col-span-5">
          <SideSteps
            title="What this shows"
            items={[
              "Agents only pay through Vouch (never the seller URL)",
              "Plain: Agent B’s discount is in the quote",
              "Native: Agent B’s discount is an escrow rebate after full pay",
            ]}
          />
          <SideInk
            kicker="Tip"
            title={
              <>
                Prove a pay after{" "}
                <Link to="/demo" className="text-[#93c5fd] no-underline">
                  a cycle
                </Link>
              </>
            }
            body="Native escrow balances (prepaid for Vouch remits) show under ledger.escrow."
          />
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 text-[14px] font-semibold text-ink no-underline"
          >
            Open cycles
            <ArrowRight size={14} weight="bold" />
          </Link>
        </aside>
      </div>
    </Page>
  );
}

function HistoryRow({ entry }: { entry: any }) {
  const type = entry.type || "entry";
  const amount = Number(entry.amount || 0).toFixed(4);
  const when = entry.timestamp
    ? new Date(entry.timestamp).toLocaleString()
    : "";
  const label =
    type === "payment"
      ? "Payment"
      : type === "commission"
        ? "Commission"
        : type === "seller_credit"
          ? "Seller credit"
          : type === "referrer_credit"
            ? "Referrer credit"
            : type;
  const settleTx = entry.settleTxId || entry.txId || null;
  const forwardTx = entry.forwardTxId || null;

  return (
    <li className="border-b border-line py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-ink">
            {label}
            {entry.mode === "direct" && (
              <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-ok">
                Direct
              </span>
            )}
            {entry.mode === "onchain" && (
              <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-ok">
                On-chain
              </span>
            )}
            {entry.mode === "ledger" && type === "referrer_credit" && (
              <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Ledger
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">{when}</p>
          {entry.referral && (
            <p className="mt-1 text-[12px] text-muted">
              Ref{" "}
              <span className="font-mono">{shortAddr(entry.referral)}</span>
            </p>
          )}
          {entry.fromPayer && (
            <p className="mt-1 text-[12px] text-muted">
              From{" "}
              <span className="font-mono">{shortAddr(entry.fromPayer)}</span>
            </p>
          )}
          {entry.payoutAddress && (
            <p className="mt-1 text-[12px] text-muted">
              To{" "}
              <a
                href={explorerAddressUrl(entry.payoutAddress)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-signal hover:underline"
              >
                {shortAddr(entry.payoutAddress)}
              </a>
            </p>
          )}
          {entry.address && type === "referrer_credit" && (
            <p className="mt-1 text-[12px] text-muted">
              To{" "}
              <a
                href={explorerAddressUrl(entry.address)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-signal hover:underline"
              >
                {shortAddr(entry.address)}
              </a>
            </p>
          )}
          {entry.sellerId && (
            <p className="mt-1 text-[12px] text-muted">
              Seller <span className="font-mono">{entry.sellerId}</span>
            </p>
          )}
          {entry.forwardError && (
            <p className="mt-1 text-[12px] font-medium text-danger">
              {entry.forwardError}
            </p>
          )}
        </div>
        <p className="font-mono text-[14px] font-semibold">${amount}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {settleTx && (
          <a
            href={explorerTxUrl(settleTx)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[12px] text-signal hover:underline"
          >
            settle {settleTx.slice(0, 12)}…
          </a>
        )}
        {forwardTx && (
          <a
            href={explorerTxUrl(forwardTx)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[12px] text-signal hover:underline"
          >
            payout {forwardTx.slice(0, 12)}…
          </a>
        )}
      </div>
    </li>
  );
}
