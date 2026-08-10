import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";

/**
 * use-wallet-ui swallows connect failures into console.error.
 * Surface the last one so “not working” isn’t silent.
 */
export default function WalletErrorToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const original = console.error;
    console.error = (...args: unknown[]) => {
      original.apply(console, args as Parameters<typeof console.error>);
      const head = String(args[0] ?? "");
      if (!head.includes("Error connecting to")) return;

      const wallet = head.replace(/^Error connecting to\s*/i, "").replace(/:$/, "");
      const err = args[1] as { message?: string; name?: string } | string | undefined;
      const detail =
        typeof err === "string"
          ? err
          : err?.message || err?.name || "Connection failed";

      const cancelled =
        /cancel|reject|close|denied|user/i.test(detail) ||
        detail === "ConnectModalClosedError" ||
        detail === "PeraWalletConnectError";

      if (cancelled && /cancel|reject|close|denied|user|ModalClosed/i.test(detail)) {
        setMessage(`${wallet}: connection cancelled. Try again and approve in the wallet.`);
        return;
      }

      setMessage(
        `${wallet}: ${detail}. Use Algorand Testnet, approve the prompt, and retry. If it keeps failing, clear site data for localhost:5173.`,
      );
    };

    return () => {
      console.error = original;
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 8000);
    return () => window.clearTimeout(t);
  }, [message]);

  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-2xl border border-danger/30 bg-surface px-4 py-3 shadow-[0_12px_40px_rgba(10,10,10,0.12)]">
        <p className="flex-1 text-[13px] leading-snug text-ink">{message}</p>
        <button
          type="button"
          className="shrink-0 rounded-full p-1 text-muted hover:text-ink"
          aria-label="Dismiss"
          onClick={() => setMessage(null)}
        >
          <X size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
