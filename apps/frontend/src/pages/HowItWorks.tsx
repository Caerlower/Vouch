/**
 * Full product explainer: referral discount is the product.
 * Native = full list pay + escrow rebate/commission. Plain = discount in the quote.
 */
import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import { Bezel, Btn, Page } from "../components/ui";

export default function HowItWorks() {
  return (
    <Page
      title="How it works"
      lede="Agent A shares a link. Agent B gets a discount. Agent A earns a commission. Agents only pay through Vouch."
    >
      <div className="space-y-10">
        <Bezel>
          <div className="grid gap-0 divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              {
                who: "Agent A",
                role: "Referrer",
                get: "Earns commission when Agent B pays",
              },
              {
                who: "Agent B",
                role: "Buyer",
                get: "Gets the referral discount",
              },
              {
                who: "Seller",
                role: "API owner",
                get: "Gets paid · funds discounts from escrow",
              },
            ].map((row) => (
              <div key={row.who} className="px-5 py-6 sm:px-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                  {row.role}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">
                  {row.who}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">
                  {row.get}
                </p>
              </div>
            ))}
          </div>
        </Bezel>

        <section className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
              The product
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              Discount + commission
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Sellers set two numbers — typically{" "}
              <span className="font-semibold text-ink">20% buyer discount</span>{" "}
              and{" "}
              <span className="font-semibold text-ink">8% referrer commission</span>
              . That is the offer.
            </p>
          </div>
          <div className="lg:col-span-8">
            <Bezel>
              <div className="space-y-0 p-2 font-mono text-[13px]">
                {[
                  ["List price", "e.g. 0.05 USDC"],
                  ["Buyer discount", "e.g. 20% → Agent B"],
                  ["Referrer commission", "e.g. 8% → Agent A"],
                  ["Middle layer", "Agents use Vouch links only"],
                ].map(([a, b], i) => (
                  <div
                    key={a}
                    className={[
                      "flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-4",
                      i === 3 ? "bg-ink text-white" : "bg-bg text-ink",
                    ].join(" ")}
                  >
                    <span className="font-semibold tracking-tight">{a}</span>
                    <span className={i === 3 ? "text-white/60" : "text-muted"}>
                      {b}
                    </span>
                  </div>
                ))}
              </div>
            </Bezel>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Bezel tone="ink">
            <div className="flex h-full flex-col p-5 sm:p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">
                Core · Native x402
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Full pay, then rebate
              </h3>
              <p className="mt-3 flex-1 text-[14px] leading-relaxed text-white/55">
                Agent B pays <span className="text-white">full list</span> to
                the seller. Vouch remits the{" "}
                <span className="text-white">discount</span> to Agent B and{" "}
                <span className="text-white">commission</span> to Agent A from
                escrow.
              </p>
              <ol className="mt-5 space-y-2 border-t border-white/10 pt-5 text-[13px] text-white/70">
                <li>1. Seller funds escrow</li>
                <li>2. Agent A pays, then shares a link</li>
                <li>3. Agent B pays full list</li>
                <li>4. Vouch remits discount + commission</li>
              </ol>
              <Btn
                to="/demo/native"
                className="mt-6 w-full !bg-white !text-ink hover:!bg-white/90"
                arrow
              >
                Run native cycle
              </Btn>
            </div>
          </Bezel>

          <Bezel>
            <div className="flex h-full flex-col p-5 sm:p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                Secondary · Plain Web2
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                Discount in the quote
              </h3>
              <p className="mt-3 flex-1 text-[14px] leading-relaxed text-muted">
                Vouch owns the charge. Agent B pays a cheaper quote; Agent A
                still earns commission.
              </p>
              <ol className="mt-5 space-y-2 border-t border-line pt-5 text-[13px] text-muted">
                <li>1. Register a plain API on Vouch</li>
                <li>2. Agent A pays, then shares a link</li>
                <li>3. Agent B sees a discounted quote</li>
                <li>4. Agent B pays less; Agent A earns</li>
              </ol>
              <Btn to="/demo/plain" variant="ghost" className="mt-6 w-full" arrow>
                Run plain cycle
              </Btn>
            </div>
          </Bezel>
        </section>

        <section>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
            Walkthrough
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Agent A → discount for Agent B
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "01",
                t: "Seller registers",
                d: "List price, discount (e.g. 20%), commission (e.g. 8%).",
              },
              {
                n: "02",
                t: "Agent A pays",
                d: "First paid call through Vouch.",
              },
              {
                n: "03",
                t: "Agent A shares a link",
                d: "Short referral link — still Vouch, never the seller API.",
              },
              {
                n: "04",
                t: "Agent B gets the discount",
                d: "Native: rebate after pay. Plain: cheaper quote.",
              },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-line bg-surface px-4 py-5"
              >
                <p className="font-mono text-[11px] text-muted">{s.n}</p>
                <h3 className="mt-2 text-[15px] font-semibold tracking-tight">
                  {s.t}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  {s.d}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
              Middle layer
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Agents never see the seller URL
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Pay links and referral links stay on Vouch. Upstream stays private.
            </p>
          </div>
          <div className="lg:col-span-7">
            <Bezel>
              <div className="space-y-4 p-5 sm:p-6">
                <FlowRow label="Pay link" value="Vouch resource for a seller" />
                <FlowRow
                  label="Referral link"
                  value="Short code Agent A shares"
                />
                <FlowRow
                  label="Native"
                  value="Full list → seller · rebate + commission ← escrow"
                />
                <FlowRow
                  label="Plain"
                  value="Discounted quote · commission to Agent A"
                />
              </div>
            </Bezel>
          </div>
        </section>

        <Bezel tone="ink">
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">
                Try it
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                See the discount on Testnet
              </h2>
              <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/55">
                Opt into USDC ASA 10458941, then walk Agent A → referral → Agent
                B.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Btn
                to="/demo/native"
                className="!bg-white !text-ink hover:!bg-white/90"
                arrow
              >
                Native cycle
              </Btn>
              <Btn
                to="/register"
                variant="ghost"
                className="!border-white/25 !bg-transparent !text-white hover:!border-white"
              >
                Register seller
              </Btn>
            </div>
          </div>
        </Bezel>

        <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-6 text-[14px]">
          {[
            { to: "/demo", label: "Cycles" },
            { to: "/register", label: "Register" },
            { to: "/refer", label: "Refer" },
            { to: "/ledger", label: "Ledger" },
            { to: "/", label: "Home" },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="inline-flex items-center gap-1 font-semibold text-ink no-underline hover:text-signal"
            >
              {l.label}
              <ArrowRight size={14} />
            </Link>
          ))}
        </nav>
      </div>
    </Page>
  );
}

function FlowRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-3 border-b border-line pb-4 last:border-0 last:pb-0">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span className="text-[14px] font-medium leading-snug text-ink">
        {value}
      </span>
    </div>
  );
}
