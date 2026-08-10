import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { isPlausibleAlgorandAddress } from "../pricing.js";
import { getStats } from "../referral-store.js";

const router: Router = createRouter();

router.get("/stats/:address", (req: Request, res: Response) => {
  const address = String(req.params.address);
  if (!isPlausibleAlgorandAddress(address)) {
    return res.status(400).json({
      error: "invalid_address",
      message: "Expected a 58-character Algorand address",
    });
  }
  return res.json(getStats(address));
});

export default router;
