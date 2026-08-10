import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { getFullState } from "../referral-store.js";
import { getPayoutSnapshot } from "../payout.js";
import { listPublicSellers } from "../sellers.js";
import { getEscrowSnapshot } from "../escrow.js";

const router: Router = createRouter();

router.get("/ledger", async (_req: Request, res: Response) => {
  const state = getFullState();
  const payouts = getPayoutSnapshot();

  res.json({
    service: "vouch-backend",
    role: "x402 referral middleware",
    accounts: state.accounts,
    usedNonceCount: state.usedNonceCount,
    sellers: listPublicSellers(),
    payouts,
    escrow: await getEscrowSnapshot(),
    totals: {
      accountCount: Object.keys(state.accounts).length,
      sellerPendingUsdc: payouts.seller.pendingUsdc,
      referrerPendingUsdc: Object.values(
        payouts.referrers.pendingByAddress,
      ).reduce((a, b) => a + b, 0),
      usedNonces: state.usedNonceCount,
    },
  });
});

export default router;
