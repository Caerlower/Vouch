import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Cube, Plugs } from "@phosphor-icons/react";
import { Bezel, Page } from "../components/ui";

const ease = [0.32, 0.72, 0, 1] as const;

const cycles = [
  {
    to: "/demo/native",
    kicker: "Core",
    title: "Native x402",
    blurb:
      "Agent B pays the seller the full list price through Vouch. Vouch then remits the buyer discount (rebate) to Agent B and commission to Agent A from prepaid escrow.",
    steps: [
      "Register · set discount and commission · fund escrow",
      "Agent A pays · creates a referral link",
      "Agent B pays full list · gets discount rebate",
    ],
    icon: Cube,
    primary: true,
  },
  {
    to: "/demo/plain",
    kicker: "Secondary",
    title: "Plain Web2",
    blurb:
      "Seller API has no payments. Vouch owns the charge. When Agent B uses Agent A’s referral link, the quote is already discounted — Agent B pays less up front.",
    steps: [
      "Register the plain API · set the discount",
      "Agent A pays · creates a referral link",
      "Agent B pays the discounted quote",
    ],
    icon: Plugs,
    primary: false,
  },
] as const;

export default function DemoHub() {
  return (
    <Page
      title="Cycles"
      lede="Two ways to deliver the same product: a referral discount for Agent B and a commission for Agent A. Real Testnet USDC."
      actions={
        <Link
          to="/how-it-works"
          className="text-[13px] font-semibold text-muted no-underline hover:text-ink"
        >
          How it works
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {cycles.map((c, i) => (
          <motion.div
            key={c.to}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: i * 0.06, ease }}
          >
            <Bezel tone={c.primary ? "ink" : "surface"}>
              <Link
                to={c.to}
                className={[
                  "group flex h-full flex-col p-5 no-underline sm:p-6",
                  c.primary ? "text-white" : "text-ink",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className={[
                        "font-mono text-[11px] uppercase tracking-[0.14em]",
                        c.primary ? "text-white/45" : "text-muted",
                      ].join(" ")}
                    >
                      {c.kicker}
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                      {c.title}
                    </h2>
                  </div>
                  <c.icon
                    size={26}
                    weight="duotone"
                    className={c.primary ? "text-[#93c5fd]" : "text-ink"}
                  />
                </div>
                <p
                  className={[
                    "mt-3 flex-1 text-[14px] leading-relaxed",
                    c.primary ? "text-white/55" : "text-muted",
                  ].join(" ")}
                >
                  {c.blurb}
                </p>
                <ol
                  className={[
                    "mt-5 space-y-1.5 border-t pt-4 text-[13px]",
                    c.primary
                      ? "border-white/10 text-white/65"
                      : "border-line text-muted",
                  ].join(" ")}
                >
                  {c.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <span
                  className={[
                    "mt-6 inline-flex items-center gap-1.5 text-[14px] font-semibold",
                    c.primary ? "text-white" : "text-ink",
                  ].join(" ")}
                >
                  Open cycle
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </Bezel>
          </motion.div>
        ))}
      </div>
    </Page>
  );
}
