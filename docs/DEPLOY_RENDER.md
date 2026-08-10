# Deploy Vouch on Render

Three services from [`render.yaml`](../render.yaml):

| Service | Role | URL example |
|---|---|---|
| `vouch-seller` | Mock seller (plain + native x402) | `https://vouch-seller.onrender.com` |
| `vouch-api` | Referral + escrow middleware | `https://vouch-api.onrender.com` |
| `vouch-web` | Vite SPA (static) | `https://vouch-web.onrender.com` |

**Important:** sellers, short links, and remits are **in-memory**. Free Render web services sleep after idle and **lose that state**. For a reliable demo, put `vouch-api` and `vouch-seller` on **Starter** (always-on).

---

## 0. Push this repo to GitHub

This folder is not a git remote yet. From the repo root:

```bash
cd /Users/manavgoyal/Vouch
git init
git add .
git commit -m "Prepare Render deploy"
# Create an empty GitHub repo, then:
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Do **not** commit `apps/backend/.env` (it is gitignored). Secrets go in the Render Dashboard only.

---

## 1. Create the Blueprint

1. Open [Render Dashboard → Blueprints](https://dashboard.render.com/blueprints) → **New Blueprint Instance**.
2. Connect the GitHub repo.
3. Render reads `render.yaml` and proposes `vouch-seller`, `vouch-api`, `vouch-web`.
4. Apply the Blueprint.

---

## 2. Fill secret env vars

In **vouch-seller → Environment**:

| Key | Value |
|---|---|
| `NATIVE_PAY_TO` | Same as local `VOUCH_PAY_TO` (seller receiving address, opted into USDC ASA `10458941`) |
| `VOUCH_FULFILL_SECRET` | Long random string (same on API + seller) |

In **vouch-api → Environment**:

| Key | Value |
|---|---|
| `VOUCH_PAY_TO` | Same payTo address |
| `ESCROW_APP_ID` | e.g. `769014186` |
| `VOUCH_OPERATOR_MNEMONIC` | Operator 25-word mnemonic |
| `VOUCH_OPERATOR_ADDRESS` | Operator address |
| `VOUCH_OPERATOR_API_KEY` | Random key for withdraw header |
| `VOUCH_FULFILL_SECRET` | **Same** as seller |
| `PUBLIC_SITE_URL` | `https://vouch-web.onrender.com` (your real web URL, no trailing slash) |

`SELLER_SERVICE_URL` and `VITE_VOUCH_API` are wired automatically from sibling services.

After setting `PUBLIC_SITE_URL`, **Manual Deploy** the API once. After the API URL exists, **Manual Deploy** the static site so Vite bakes in `VITE_VOUCH_API`.

---

## 3. Smoke check

```bash
curl -s https://vouch-seller.onrender.com/health
curl -s https://vouch-api.onrender.com/health
```

Open the web URL → `/demo` → Native cycle.

1. **Register** a native seller (or re-register after a sleep wipe).
2. **Fund escrow** with the **payTo** wallet (grouped deposit), not a plain USDC send.
3. Run Agent A → referral → Agent B.

Referral short links use `PUBLIC_SITE_URL` (`/go/:code` on the static site).

---

## 4. Local vs production

| Local | Production |
|---|---|
| Vite proxies `/api` → `:4000` | `VITE_VOUCH_API` = full API origin |
| `PUBLIC_SITE_URL=http://localhost:5173` | Render web URL |
| `SELLER_SERVICE_URL=http://localhost:4001` | `vouch-seller` URL |

Backend `npm start` no longer requires a `.env` file (Render injects env). Locally keep using `npm run dev` with `apps/backend/.env`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Web calls `/api/...` and 404s | Rebuild `vouch-web` after API is live (`VITE_VOUCH_API` missing at build) |
| `/go/...` links point at localhost | Set `PUBLIC_SITE_URL` on API to the web URL, redeploy API |
| Fulfill / native resource fails | Same `VOUCH_FULFILL_SECRET` on API + seller |
| Escrow remit fails after sleep | Re-register seller + re-fund escrow (in-memory wipe); prefer Starter plan |
| Cold start 30–60s | Free tier spinning up — wait and retry |
