/**
 * THESIS: Referral discounts for paid APIs — Vouch is the middle layer.
 * Native: full list to seller, then discount rebate + commission from escrow.
 * Plain: discount baked into the quote Agent B pays.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight,
  Cube,
  LinkSimple,
  Plugs,
  SealCheck,
  Wallet,
} from "@phosphor-icons/react";
import { Btn, Bezel } from "../components/ui";

const ease = [0.32, 0.72, 0, 1] as const;

export default function Landing() {
  return (
    <div className="overflow-x-hidden">
      <section className="mx-auto grid min-h-[calc(100dvh-5rem)] w-full max-w-5xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-8 lg:grid-cols-12 lg:gap-8 lg:pb-20">
        <motion.div
          className="lg:col-span-5"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
        >
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" />
            Referral discounts · Algorand x402
          </p>
          <h1 className="text-[clamp(3.5rem,10vw,5.5rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-ink">
            Vouch
          </h1>
          <p className="mt-5 max-w-[34ch] text-xl font-medium leading-snug tracking-tight text-ink/90 md:text-2xl">
            Referral discounts for paid APIs.
          </p>
          <p className="mt-4 max-w-[40ch] text-[15px] leading-relaxed text-muted">
            Agent A shares a link. Agent B gets a discount. Agent A earns a
            commission. Agents only pay through Vouch.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Btn to="/demo/native" arrow>
              See the discount
            </Btn>
            <Btn to="/how-it-works" variant="ghost">
              How it works
            </Btn>
          </div>
        </motion.div>

        <motion.div
          className="lg:col-span-7"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.08, ease }}
        >
          <Bezel>
            <div className="relative overflow-hidden p-5 sm:p-7">
              <div className="absolute left-3 top-3 h-3 w-3 border-l-2 border-t-2 border-signal" />
              <div className="absolute right-3 top-3 h-3 w-3 border-r-2 border-t-2 border-signal" />
              <div className="absolute bottom-3 left-3 h-3 w-3 border-b-2 border-l-2 border-signal" />
              <div className="absolute bottom-3 right-3 h-3 w-3 border-b-2 border-r-2 border-signal" />

              <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                    Referral offer
                  </p>
                  <p className="mt-1 text-lg font-semibold tracking-tight">
                    Discount for Agent B · commission for Agent A
                  </p>
                </div>
                <div className="rounded-full bg-ink px-3 py-1 font-mono text-[11px] text-white">
                  ~20% off
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <SlipRow
                  label="Stack"
                  value={
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Chip>Agent</Chip>
                      <ArrowRight size={12} className="text-muted" />
                      <Chip strong>Vouch</Chip>
                      <ArrowRight size={12} className="text-muted" />
                      <Chip>Seller API</Chip>
                    </span>
                  }
                />
                <SlipRow
                  label="List price"
                  value="Full amount Agent B pays the seller (native)"
                />
                <SlipRow
                  label="Buyer discount"
                  value="Rebate to Agent B from seller escrow"
                />
                <SlipRow
                  label="Referrer cut"
                  value="Commission to Agent A from the same escrow"
                />
                <SlipRow
                  label="Plain mode"
                  value="Discount already in Agent B’s quote"
                />
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-line pt-5">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                    Example · 0.05 list · 20% discount
                  </p>
                  <p className="font-mono text-2xl font-semibold tracking-tight">
                    0.01{" "}
                    <span className="text-base text-muted">USDC back to Agent B</span>
                  </p>
                </div>
                <Btn to="/how-it-works" className="!px-6">
                  Full story
                </Btn>
              </div>
            </div>
          </Bezel>
        </motion.div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-20 md:grid-cols-12">
          <div className="md:col-span-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
              01 — The discount
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Agent A refers. Agent B saves.
            </h2>
            <p className="mt-4 max-w-[40ch] text-[15px] leading-relaxed text-muted">
              A short referral link carries a buyer discount and a referrer
              commission. Details live on How it works.
            </p>
          </div>
          <ol className="md:col-span-8 grid gap-0 sm:grid-cols-2">
            {[
              {
                n: "01",
                t: "Seller sets the offer",
                d: "List price, buyer discount (e.g. 20%), and Agent A’s commission (e.g. 8%).",
                icon: Cube,
              },
              {
                n: "02",
                t: "Agent A pays",
                d: "First call through Vouch at full price — then Agent A can create a referral link.",
                icon: Wallet,
              },
              {
                n: "03",
                t: "Agent A shares the link",
                d: "Short referral link still points at Vouch. Seller API URL never leaks.",
                icon: LinkSimple,
              },
              {
                n: "04",
                t: "Agent B gets the discount",
                d: "Native: full pay, then rebate. Plain: cheaper quote. Agent A gets commission either way.",
                icon: SealCheck,
              },
            ].map((s) => (
              <li
                key={s.n}
                className="border-t border-line py-6 pr-4 sm:odd:border-r sm:odd:pr-6 sm:even:pl-6"
              >
                <s.icon size={22} weight="duotone" className="text-ink" />
                <p className="mt-4 font-mono text-[11px] text-muted">{s.n}</p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight">{s.t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-20">
        <div className="mb-10 max-w-xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
            02 — Two ways to deliver the discount
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Same offer. Different pay math.
          </h2>
          <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-muted">
            Agent A refers → Agent B gets the discount. Native remits after full
            pay; plain discounts the quote.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Bezel tone="ink">
            <div className="flex h-full flex-col p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">
                    Core
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                    Native x402
                  </h3>
                </div>
                <Cube size={26} weight="duotone" className="text-[#93c5fd]" />
              </div>
              <p className="mt-3 flex-1 text-[14px] leading-relaxed text-white/55">
                Agent B pays{" "}
                <span className="text-white">full list</span> to the seller.
                Vouch remits the <span className="text-white">rebate</span> to
                Agent B and <span className="text-white">commission</span> to
                Agent A from escrow.
              </p>
              <Btn
                to="/demo/native"
                className="mt-6 w-full !bg-white !text-ink hover:!bg-white/90"
                arrow
              >
                Open native cycle
              </Btn>
            </div>
          </Bezel>
          <Bezel>
            <div className="flex h-full flex-col p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                    Secondary
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold tracking-tight">
                    Plain Web2
                  </h3>
                </div>
                <Plugs size={26} weight="duotone" className="text-ink" />
              </div>
              <p className="mt-3 flex-1 text-[14px] leading-relaxed text-muted">
                Vouch owns the charge. Agent B pays a discounted quote; Agent A
                still earns commission.
              </p>
              <Btn to="/demo/plain" variant="ghost" className="mt-6 w-full" arrow>
                Open plain cycle
              </Btn>
            </div>
          </Bezel>
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-20 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">
              03 — Middle layer
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Discounts without leaking the API.
            </h2>
            <p className="mt-4 max-w-[36ch] text-[15px] leading-relaxed text-muted">
              Agents hit Vouch links only. The seller API stays private; Vouch
              handles discount and commission.
            </p>
            <Btn to="/how-it-works" variant="ghost" className="mt-6" arrow>
              Read the full explainer
            </Btn>
          </div>
          <div className="lg:col-span-7">
            <Bezel>
              <div className="space-y-0 p-2 font-mono text-[13px]">
                {[
                  ["Agent wallet", "pays via Vouch"],
                  ["Vouch", "discount · commission · remit"],
                  ["Seller API", "private · gets paid"],
                ].map(([a, b], i) => (
                  <div
                    key={a}
                    className={[
                      "flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-4",
                      i === 1 ? "bg-ink text-white" : "bg-bg text-ink",
                    ].join(" ")}
                  >
                    <span className="font-semibold tracking-tight">{a}</span>
                    <span className={i === 1 ? "text-white/60" : "text-muted"}>
                      {b}
                    </span>
                  </div>
                ))}
              </div>
            </Bezel>
          </div>
        </div>
      </section>

      <section className="mx-auto mb-4 w-full max-w-5xl px-4 py-16">
        <Bezel tone="ink">
          <div className="border-b border-white/10 px-5 py-5 sm:px-7 sm:py-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">
              Next step
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              Watch Agent B get the discount.
            </h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-white/55">
              Opt both wallets into Testnet USDC (ASA 10458941). Native: full pay
              + escrow rebate. Plain: discounted quote.
            </p>
          </div>

          <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              ["01", "Register the seller", "Set discount and commission"],
              ["02", "Agent A pays + shares link", "Creates the referral offer"],
              ["03", "Agent B gets the discount", "Rebate or cheaper quote"],
            ].map(([n, t, d]) => (
              <div key={n} className="px-5 py-4 sm:px-6">
                <p className="font-mono text-[11px] text-white/40">{n}</p>
                <p className="mt-1 text-[15px] font-semibold tracking-tight">
                  {t}
                </p>
                <p className="mt-0.5 text-[13px] text-white/45">{d}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-white/10 p-4 sm:flex-row sm:p-5">
            <Btn
              to="/demo/native"
              className="w-full !bg-white !py-3 !text-ink hover:!bg-white/90 sm:flex-1"
              arrow
            >
              Native cycle
            </Btn>
            <Btn
              to="/how-it-works"
              variant="ghost"
              className="w-full !border-white/25 !bg-transparent !py-3 !text-white hover:!border-white sm:flex-1"
            >
              How it works
            </Btn>
          </div>
        </Bezel>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-20">
        <div className="border-t border-line pt-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Explore
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            Everything on the site
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                to: "/how-it-works",
                label: "How it works",
                d: "Discount, commission, native rebate vs plain quote",
              },
              {
                to: "/demo",
                label: "Cycles",
                d: "Walk Agent A → Agent B on Testnet USDC",
              },
              {
                to: "/demo/native",
                label: "Native cycle",
                d: "Full list pay · discount rebate from escrow",
              },
              {
                to: "/demo/plain",
                label: "Plain cycle",
                d: "Discount already in Agent B’s quote",
              },
              {
                to: "/register",
                label: "Register",
                d: "Point Vouch at your API · set the discount",
              },
              {
                to: "/refer",
                label: "Refer",
                d: "Create a short referral link after you pay",
              },
              {
                to: "/ledger",
                label: "Ledger",
                d: "Payments, rebates, and commissions on-chain",
              },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group rounded-2xl border border-line bg-surface px-4 py-4 no-underline transition-colors hover:border-ink"
              >
                <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-ink">
                  {item.label}
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </span>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  {item.d}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

type SlipRowProps = {
  label: string;
  value: ReactNode;
  mono?: boolean;
};

function SlipRow({ label, value, mono }: SlipRowProps) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3 border-b border-line/80 py-2.5 last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span
        className={[
          "text-[14px] font-medium text-ink",
          mono ? "font-mono text-[13px]" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

type ChipProps = {
  children?: ReactNode;
  strong?: boolean;
};

function Chip({ children, strong }: ChipProps) {
  return (
    <span
      className={[
        "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold",
        strong ? "bg-ink text-white" : "bg-bg text-ink",
      ].join(" ")}
    >
      {children}
    </span>
  );
}
