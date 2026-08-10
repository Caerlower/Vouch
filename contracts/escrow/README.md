# VouchEscrow (Algorand Application)

Puya / Algorand Python contract that holds Testnet USDC for native referral remits.

## Compile

```bash
puyapy vouch_escrow.py --out-dir out
```

## Deploy (TestNet)

```bash
# From repo root — fund apps/backend operator with ≥3 TestNet ALGO first
npm run deploy:escrow
```

Writes `ESCROW_APP_ID` / `VOUCH_OPERATOR_*` into `apps/backend/.env`.

## Methods

| Method | Who | Effect |
|--------|-----|--------|
| `create` | creator | Set operator + USDC asset id |
| `bootstrap` | operator | App opts into USDC |
| `register_owner` | operator | Bind seller_id → owner (required before deposit) |
| `deposit` | anyone (owner registered) | Grouped axfer → credit seller box |
| `remit` | operator | Inner axfers: rebate + commission |
| `withdraw` | owner/operator | Pull unused USDC **to owner only** |
| `get_balance` | readonly | Seller microUSDC |
| `get_owner` | readonly | Registered owner |

Referral eligibility is checked off-chain by `@vouch/backend`; only the operator can call `remit`.
