# Deploy Vouch on Render — full guide

Repo: https://github.com/Caerlower/Vouch  
Blueprint file: [`render.yaml`](../render.yaml)

| Service | Role | Typical URL |
|---|---|---|
| `vouch-seller` | Mock seller (plain + native x402) | `https://vouch-seller.onrender.com` |
| `vouch-api` | Referral + escrow middleware | `https://vouch-api.onrender.com` |
| `vouch-web` | Vite SPA (static site) | `https://vouch-web.onrender.com` |

**Free tier note:** web services sleep when idle and **wipe in-memory state** (sellers, short links, remits). For a stable demo, upgrade `vouch-api` + `vouch-seller` to **Starter**.

Do **not** commit `apps/backend/.env` or `apps/seller-demo/.env`. Paste secrets only in the Render Dashboard.

---

## Step 1 — Prerequisites

1. GitHub repo connected (already: `Caerlower/Vouch`).
2. Render account: https://dashboard.render.com  
3. Keep `apps/backend/.env` open locally — you will copy values from it.
4. Operator wallet has Testnet ALGO; payTo wallet opted into USDC ASA `10458941`.

---

## Step 2 — Create the Blueprint

1. Open [Blueprints → New Blueprint Instance](https://dashboard.render.com/blueprints).
2. Connect **GitHub** → select **Caerlower/Vouch** → branch **main**.
3. Render reads `render.yaml` and shows three services.
4. Click **Apply**.
5. Wait until all three show **Live** (first free deploy can take several minutes; cold starts are slow).

---

## Step 3 — Fill environment variables

Blueprint already sets non-secret defaults. Anything marked **YOU SET** must be filled in the Dashboard or the service will fail / misbehave.

### A. `vouch-seller` → Environment

| Key | You set? | Value |
|---|---|---|
| `NODE_VERSION` | Auto | `20` |
| `BASE_PRICE_USDC` | Auto | `0.05` |
| `NATIVE_PAY_TO` | **YOU SET** | Same as local `VOUCH_PAY_TO` — Algorand Testnet address that receives native x402 pays (must be opted into ASA `10458941`). Example shape: `RUXST…KCKY` |
| `VOUCH_FULFILL_SECRET` | **YOU SET** | Copy from local `apps/backend/.env` → `VOUCH_FULFILL_SECRET` (must match API exactly). Generate fresh with `openssl rand -hex 32` if you prefer, then set the **same** value on both seller and API. |
| `PORT` | Auto (Render) | Do not set manually |

Optional (only if you override defaults):

| Key | Notes |
|---|---|
| `VOUCH_PAY_TO` | Seller falls back to this if `NATIVE_PAY_TO` unset — prefer setting `NATIVE_PAY_TO` |

---

### B. `vouch-api` → Environment

#### Auto / already in blueprint

| Key | Value |
|---|---|
| `NODE_VERSION` | `20` |
| `SELLER_SERVICE_URL` | Auto from `vouch-seller` → `RENDER_EXTERNAL_URL` |
| `FACILITATOR_URL` | `https://facilitator.goplausible.xyz` |
| `NETWORK` | `algorand-testnet` |
| `BASE_PRICE_USDC` | `0.05` |
| `REFERRAL_DISCOUNT_PERCENT` | `20` |
| `REFERRAL_COMMISSION_PERCENT` | `8` |
| `USDC_ASA_ID` | `10458941` |
| `ALGOD_URL` | `https://testnet-api.algonode.cloud` |
| `DEMO_MODE` | `false` (keep false on the public internet) |
| `SKIP_FACILITATOR_SYNC` | `false` |
| `PORT` | Auto (Render) |

#### You must set (copy from local `apps/backend/.env`)

| Key | Where in local `.env` | What it is |
|---|---|---|
| `VOUCH_PAY_TO` | `VOUCH_PAY_TO` | Fallback payTo when a seller has no payout address. Same as `NATIVE_PAY_TO` for the demo. |
| `ESCROW_APP_ID` | `ESCROW_APP_ID` | On-chain VouchEscrow app id (e.g. `769014186`) |
| `VOUCH_OPERATOR_MNEMONIC` | `VOUCH_OPERATOR_MNEMONIC` | 25-word operator mnemonic (signs remits / deposits ops). **Never commit.** |
| `VOUCH_OPERATOR_ADDRESS` | `VOUCH_OPERATOR_ADDRESS` | Address for that mnemonic |
| `VOUCH_OPERATOR_API_KEY` | `VOUCH_OPERATOR_API_KEY` | Secret for withdraw header `x-vouch-operator-key` |
| `VOUCH_FULFILL_SECRET` | `VOUCH_FULFILL_SECRET` | **Identical** to seller’s value |
| `PUBLIC_SITE_URL` | _(set after web is live)_ | Exact `vouch-web` URL, **https**, **no trailing slash** — e.g. `https://vouch-web.onrender.com` |

Optional overrides (only if you change product knobs):

| Key | Default | Notes |
|---|---|---|
| `DEMO_MODE` | `false` | `true` unlocks `/demo/*` mint/seed endpoints — avoid on public Render |
| `BASE_PRICE_USDC` | `0.05` | List price |
| `REFERRAL_DISCOUNT_PERCENT` | `20` | Buyer rebate % |
| `REFERRAL_COMMISSION_PERCENT` | `8` | Referrer commission % |
| `FACILITATOR_URL` | GoPlausible | x402 facilitator |
| `ALGOD_URL` | AlgoNode Testnet | Algod endpoint |

---

### C. `vouch-web` → Environment

| Key | You set? | Value |
|---|---|---|
| `NODE_VERSION` | Auto | `20` |
| `VITE_VOUCH_API` | Auto | From `vouch-api` → `RENDER_EXTERNAL_URL` (baked in at **build** time) |

Optional:

| Key | Notes |
|---|---|
| `VITE_ALGOD_URL` | Only if you don’t want the frontend default public algod |

If the UI still calls `/api/...` after deploy, `VITE_VOUCH_API` was missing at build — **Manual Deploy** `vouch-web` again after the API is live.

---

## Step 4 — Deploy order after secrets

1. Save env on **vouch-seller** → Manual Deploy → wait for Live.  
2. Save env on **vouch-api** (including `PUBLIC_SITE_URL` once you know the web URL) → Manual Deploy.  
3. Manual Deploy **vouch-web** last (so Vite embeds the real API URL).  
4. If you changed `PUBLIC_SITE_URL` after the first API deploy, redeploy API once more.

---

## Step 5 — Smoke test

```bash
curl -s https://<vouch-seller-host>/health
curl -s https://<vouch-api-host>/health
```

Both should return `"ok": true`.

Then open `https://<vouch-web-host>/demo`:

1. **Register** a native seller (in-memory — redo after free-tier sleep).  
2. **Fund escrow** via Register with the **payTo** wallet (grouped deposit).  
3. Run Native cycle: Agent A pay → share link → Agent B pay.  
4. Confirm Proof links open on [Lora Testnet](https://lora.algokit.io/testnet).

---

## Quick copy checklist (secrets only)

From `apps/backend/.env` into Render:

**Seller**

- [ ] `NATIVE_PAY_TO` ← `VOUCH_PAY_TO`
- [ ] `VOUCH_FULFILL_SECRET` ← `VOUCH_FULFILL_SECRET`

**API**

- [ ] `VOUCH_PAY_TO`
- [ ] `ESCROW_APP_ID`
- [ ] `VOUCH_OPERATOR_MNEMONIC`
- [ ] `VOUCH_OPERATOR_ADDRESS`
- [ ] `VOUCH_OPERATOR_API_KEY`
- [ ] `VOUCH_FULFILL_SECRET` (same as seller)
- [ ] `PUBLIC_SITE_URL` ← your `vouch-web` https URL

**Web**

- [ ] Confirm `VITE_VOUCH_API` is set (auto); rebuild if UI can’t reach API

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| API crash on boot: `VOUCH_FULFILL_SECRET is required` | Set the secret on **both** API and seller |
| Web 404 on `/api/...` | Redeploy `vouch-web` after API is Live |
| `/go/...` links use localhost | Set `PUBLIC_SITE_URL` on API to web URL; redeploy API |
| Native fulfill fails after pay | Mismatched `VOUCH_FULFILL_SECRET` between API and seller |
| Escrow remit fails / sellers gone | Free tier slept — re-register + re-fund; prefer Starter |
| Cold start 30–60s | Wait and retry health |

---

## Local vs Render

| Concern | Local | Render |
|---|---|---|
| Frontend → API | Vite proxy `/api` → `:4000` | `VITE_VOUCH_API` = full API origin |
| Short links | `PUBLIC_SITE_URL=http://localhost:5173` | `https://vouch-web…` |
| Seller upstream | `http://localhost:4001` | Auto `SELLER_SERVICE_URL` |
| Secrets | `apps/backend/.env` | Dashboard only |
