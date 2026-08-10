import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { WalletButton } from "@txnlab/use-wallet-ui-react";
import { List, X } from "@phosphor-icons/react";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import WalletErrorToast from "./WalletErrorToast";

const links = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/demo", label: "Cycles" },
  { to: "/refer", label: "Refer" },
  { to: "/register", label: "Register" },
  { to: "/ledger", label: "Ledger" },
] as const;

type ShellProps = {
  children?: ReactNode;
};

export default function Shell({ children }: ShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4">
        <header className="pointer-events-auto grid w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-full border border-line bg-surface/90 px-3 py-2 shadow-[0_8px_30px_rgba(10,10,10,0.06)] backdrop-blur-xl">
          <NavLink
            to="/"
            className="justify-self-start pl-2 text-[15px] font-semibold tracking-tight text-ink no-underline"
            onClick={() => setOpen(false)}
          >
            Vouch
          </NavLink>

          <nav className="hidden items-center justify-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  [
                    "rounded-full px-3 py-1.5 text-[13px] font-medium no-underline transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    isActive
                      ? "bg-ink text-white"
                      : "text-muted hover:text-ink",
                  ].join(" ")
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="justify-self-end">
            <div className="hidden md:block">
              <WalletButton />
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} weight="bold" /> : <List size={18} weight="bold" />}
            </button>
          </div>
        </header>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-2xl md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="flex h-full flex-col px-6 pt-24">
              <button
                type="button"
                className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X size={18} weight="bold" />
              </button>
              {links.map((l, i) => (
                <motion.div
                  key={l.to}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.05 + i * 0.05,
                    duration: 0.45,
                    ease: [0.32, 0.72, 0, 1],
                  }}
                >
                  <NavLink
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className="block py-3 text-3xl font-semibold tracking-tight text-white no-underline"
                  >
                    {l.label}
                  </NavLink>
                </motion.div>
              ))}
              <div className="mt-8">
                <WalletButton />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 pt-20">{children}</main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-10 text-[12px] text-muted">
        <span>Algorand Testnet · on-chain USDC</span>
        <NavLink
          to="/how-it-works"
          className="font-semibold text-muted no-underline hover:text-ink"
        >
          How discounts work
        </NavLink>
      </footer>

      <WalletErrorToast />
    </div>
  );
}
