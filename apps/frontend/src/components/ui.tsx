import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

type BtnVariant = "primary" | "ghost" | "signal";

type BtnProps<T extends ElementType = "button"> = {
  as?: T;
  to?: string;
  href?: string;
  variant?: BtnVariant;
  className?: string;
  children?: ReactNode;
  arrow?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "to" | "href" | "variant" | "className" | "children">;

export function Btn<T extends ElementType = "button">({
  as,
  to,
  href,
  variant = "primary",
  className = "",
  children,
  arrow,
  ...props
}: BtnProps<T>) {
  const As = as ?? "button";
  const Comp: ElementType = to ? Link : href ? "a" : As;
  const extra = to ? { to } : href ? { href } : {};
  const base =
    "group inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold tracking-tight no-underline transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";
  const variants: Record<BtnVariant, string> = {
    primary: "bg-ink text-white hover:bg-ink/90",
    ghost:
      "border border-line bg-surface text-ink hover:border-ink",
    signal: "bg-signal text-white hover:bg-signal/90",
  };

  return (
    <Comp
      className={[base, variants[variant], className].join(" ")}
      {...extra}
      {...props}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {children}
      </span>
      {arrow ? (
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px">
          <ArrowUpRight size={14} weight="bold" />
        </span>
      ) : null}
    </Comp>
  );
}

type BezelProps = {
  children?: ReactNode;
  className?: string;
  tone?: "surface" | "ink";
};

export function Bezel({ children, className = "", tone = "surface" }: BezelProps) {
  const outer =
    tone === "ink"
      ? "rounded-[1.75rem] bg-ink p-[3px]"
      : "rounded-[1.75rem] border border-black/5 bg-black/[0.03] p-1.5";
  const inner =
    tone === "ink"
      ? "overflow-hidden rounded-[calc(1.75rem-3px)] bg-ink text-white"
      : "overflow-hidden rounded-[calc(1.75rem-0.375rem)] border border-line bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]";

  return (
    <div className={[outer, className].join(" ")}>
      <div className={inner}>{children}</div>
    </div>
  );
}

type PageProps = {
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
};

export function Page({ title, lede, children, actions }: PageProps) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            {title}
          </h1>
          {lede ? (
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{lede}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

type PanelProps = {
  children?: ReactNode;
  className?: string;
};

export function Panel({ children, className = "" }: PanelProps) {
  return (
    <div
      className={[
        "rounded-2xl border border-line bg-surface p-5 shadow-[0_12px_40px_rgba(10,10,10,0.04)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

type KvProps = {
  rows: Array<[ReactNode, ReactNode]>;
};

export function Kv({ rows }: KvProps) {
  return (
    <dl className="grid gap-3">
      {rows.map(([k, v], i) => (
        <div
          key={typeof k === "string" ? k : i}
          className="flex items-start justify-between gap-4 border-b border-line pb-3 text-[14px]"
        >
          <dt className="font-medium text-muted">{k}</dt>
          <dd className="m-0 text-right font-semibold text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

type SideStep = string | { label: string };

type SideStepsProps = {
  title?: string;
  items: SideStep[];
};

/** Right-rail steps list — matches Refer page */
export function SideSteps({ title = "Steps", items }: SideStepsProps) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {title}
      </p>
      <ol className="mt-4 space-y-0">
        {items.map((step, i) => (
          <li
            key={typeof step === "string" ? step : step.label}
            className="flex gap-3 border-b border-line py-3 last:border-0"
          >
            <span className="font-mono text-[12px] font-medium text-signal">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[14px] font-medium leading-snug text-ink">
              {typeof step === "string" ? step : step.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type SideInkProps = {
  kicker?: string;
  title?: ReactNode;
  body?: ReactNode;
};

/** Right-rail ink callout — matches Refer page */
export function SideInk({ kicker = "Note", title, body }: SideInkProps) {
  return (
    <div className="rounded-2xl bg-ink p-5 text-white">
      <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/45">
        {kicker}
      </p>
      {title ? (
        <p className="mt-3 font-mono text-[15px] leading-snug">{title}</p>
      ) : null}
      {body ? (
        <p className="mt-2 text-[13px] leading-relaxed text-white/55">{body}</p>
      ) : null}
    </div>
  );
}
