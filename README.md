# Vouch

**Referral middleware for native x402 APIs on Algorand TestNet.**

**Core path (native):** Agents pay the seller’s full list price on-chain. Referral value remits from a real **VouchEscrow** Application (USDC ASA) that the seller pre-funds. **Secondary path (plain):** Vouch wraps a private HTTP API and applies a discount at pay time.

```
Client wallet → @vouch/backend :4000 → (after settle) @vouch/seller-demo :4001
                     │
                     ├─ short ref codes (?ref=…)
                     ├─ signed referral credential (0 ALGO self-pay note)
                     ├─ x402 + GoPlausible facilitator (real Testnet USDC)
                     └─ on-chain VouchEscrow app (deposit / remit / withdraw)
```

## Repository layout

```text
apps/
  backend/        @vouch/backend      — x402 middleware, referrals, escrow operator
  frontend/       @vouch/frontend     — wallet UI (Pera / Defly / Lute)
  seller-demo/    @vouch/seller-demo  — mock seller (plain + native x402)
contracts/
  escrow/         Puya VouchEscrow Application
docs/
  PRODUCT.md
  DESIGN.md
scripts/
  demo-flow.sh
```

## Real cycles

### Native (core)

1. Register + probe native x402; **deposit USDC into the escrow app**.
2. Agent A pays full list → seller `payTo`.
3. A mints `/go/:code`.
4. Agent B pays full list again; backend operator calls `remit` → rebate + commission leave the app on-chain.

### Plain (secondary)

1. Register private HTTP + receiving address.
2. Agent A pays full → mint referral.
3. Agent B pays a **discounted** Vouch quote.

Prerequisites: Testnet ALGO for fees, **USDC ASA `10458941` opted in**, deployed escrow (`ESCROW_APP_ID` + operator mnemonic in `apps/backend/.env`).

## Quick start

```bash
npm install
cp apps/backend/.env.example apps/backend/.env
# set VOUCH_PAY_TO (must be opted into USDC ASA 10458941)
# after deploy:escrow, ESCROW_APP_ID + VOUCH_OPERATOR_MNEMONIC are written for you

npm run deploy:escrow   # fund operator with TestNet ALGO first if needed
npm run dev:seller      # :4001
npm run dev:backend     # :4000
npm run dev:frontend    # :5173
```

Seller receiving addresses come from **Register** (plain form or native 402 probe) — not from `.env`.

Open `http://localhost:5173/demo` and pick Native or Plain.

## Key backend routes

| Method | Path | Notes |
|---|---|---|
| `GET` | `/r/:sellerId/resource?ref=<code>` | x402 paid resource |
| `GET` | `/quote?ref=<code>` | pricing preview |
| `GET` | `/links/:code` | resolve short referral |
| `POST` | `/referrals/prepare` · `/assemble` | mint signed credential → short URL |
| `POST` | `/sellers` | register seller |
| `POST` | `/escrow/:id/deposit/prepare` | unsigned deposit group for wallet |
| `POST` | `/remit` | on-chain escrow remit (operator) |
| `GET` | `/stats/:address` · `/ledger` | earnings / proof state |

## Frontend routes

- `/` — landing
- `/demo` — cycle hub (native + plain)
- `/demo/native` · `/demo/plain` — two-wallet on-chain walks
- `/refer` · `/go/:code` — mint / pay with referral
- `/register` · `/ledger` — seller registry + ledger

## Escrow trust model

Native remits use a real Algorand Application that holds USDC. **Deposits and remits are on-chain.** Referral eligibility is still decided by `@vouch/backend`; only the operator account can call `remit`. That is intentional middleware design — not a trustless referral oracle.

See [docs/PRODUCT.md](docs/PRODUCT.md), [docs/DESIGN.md](docs/DESIGN.md), and [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md) (Render blueprint).
