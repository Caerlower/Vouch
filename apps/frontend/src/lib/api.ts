const API = import.meta.env.VITE_VOUCH_API || "/api";

export class ApiError extends Error {
  data: unknown;
  status: number;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

type RequestOpts = RequestInit & {
  headers?: HeadersInit;
};

async function req<T = any>(path: string, opts?: RequestOpts): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "content-type": "application/json", ...(opts?.headers || {}) },
    ...opts,
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new ApiError(
      data.message || data.error || res.statusText,
      res.status,
      data,
    );
  }
  return data as T;
}

export type Allow402Result<T = any> = {
  status: number;
  ok: boolean;
  paymentRequired: boolean;
  data: T;
  paymentRequiredHeader: string | null;
};

/** Like req, but keeps 402 bodies (payment challenges) as success-shaped results. */
async function reqAllow402<T = any>(
  path: string,
  opts?: RequestOpts,
): Promise<Allow402Result<T>> {
  const res = await fetch(`${API}${path}`, {
    headers: { "content-type": "application/json", ...(opts?.headers || {}) },
    ...opts,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return {
    status: res.status,
    ok: res.ok,
    paymentRequired: res.status === 402,
    data,
    paymentRequiredHeader: res.headers.get("PAYMENT-REQUIRED"),
  };
}

export const api = {
  health: () => req("/health"),
  quote: (ref?: string | null, sellerId = "acme-default") => {
    const q = new URLSearchParams();
    if (ref) q.set("ref", ref);
    if (sellerId) q.set("sellerId", sellerId);
    return req(`/quote?${q}`);
  },
  stats: (address: string) => req(`/stats/${address}`),
  ledger: () => req("/ledger"),
  sellers: () => req("/sellers"),
  link: (code: string) => req(`/links/${code}`),
  probeSeller: (resourceUrl: string) =>
    req("/sellers/probe", {
      method: "POST",
      body: JSON.stringify({ resourceUrl }),
    }),
  registerSeller: (body: Record<string, unknown>) =>
    req("/sellers", { method: "POST", body: JSON.stringify(body) }),
  escrow: (sellerId: string) => req(`/escrow/${sellerId}`),
  escrowStatus: () => req("/escrow/status"),
  escrowDepositPrepare: (sellerId: string, body: Record<string, unknown>) =>
    req(`/escrow/${sellerId}/deposit/prepare`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  escrowDeposit: (sellerId: string, body: Record<string, unknown>) =>
    req(`/escrow/${sellerId}/deposit`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** Lookup only — remits run server-side after settle. */
  getRemit: (settleTxId: string) => req(`/remit/${settleTxId}`),
  /**
   * Poll until Vouch posts the escrow remit (or attempts exhaust).
   * Remit is triggered by onAfterSettle, so there can be a short delay.
   */
  waitForRemit: async (
    settleTxId: string,
    opts: { attempts?: number; delayMs?: number } = {},
  ) => {
    const attempts = opts.attempts ?? 12;
    const delayMs = opts.delayMs ?? 500;
    let lastErr: unknown = null;
    for (let i = 0; i < attempts; i++) {
      try {
        return await req(`/remit/${settleTxId}`);
      } catch (err) {
        lastErr = err;
        if (err instanceof ApiError && err.status === 404) {
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("Remit not ready yet — escrow may need funding");
  },
  prepareReferral: (body: Record<string, unknown>) =>
    req("/referrals/prepare", { method: "POST", body: JSON.stringify(body) }),
  assembleReferral: (body: Record<string, unknown>) =>
    req("/referrals/assemble", { method: "POST", body: JSON.stringify(body) }),
  /** Probe paid resource — expect 402 until settled. Prefer short `ref`. */
  probeResource: (sellerId = "acme-default", ref: string | null = null) => {
    const q = new URLSearchParams();
    if (ref) q.set("ref", ref);
    const path = `/r/${sellerId}/resource${q.toString() ? `?${q}` : ""}`;
    return reqAllow402(path);
  },
};
