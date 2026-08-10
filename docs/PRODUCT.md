# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Builders and agents on Algorand Testnet with Pera/Defly/Lute. Primary: teams already shipping **native x402** resources who want referral rebates. Secondary: wrapping a plain private HTTP API.

## Product Purpose

Vouch is the **middle layer** between agents and paid APIs on Algorand. Agents only ever hit `/r/:sellerId/resource` and `/go/:code`. For **native x402**, buyers still pay the seller’s full on-chain list price (so the seller’s verifier stays happy); Vouch then remits the referral rebate from seller-prepaid **on-chain escrow**. Optionally wraps plain Web2 APIs with the same public paths and a pay-time discount.

## Positioning

Vouch sits between client and seller on both paths. Core: native x402 + escrow remit. Secondary: plain Web2 wrap with Vouch-owned 402. Upstream URLs never appear in public links.

## Operating Context

`@vouch/backend` `:4000`, `@vouch/seller-demo` `:4001`, `@vouch/frontend` `:5173`. Testnet ALGO + USDC ASA 10458941. Escrow app deployed via `npm run deploy:escrow` (`ESCROW_APP_ID` in `apps/backend/.env`). Two demo cycles: Native and Plain.

## Capabilities

- Native x402 registration (probe payTo + price)
- On-chain seller-prepaid escrow (deposit / remit / withdraw) via VouchEscrow app
- Operator-gated remit after off-chain referral eligibility check
- Plain Web2 wrap with pay-time discount
- Short referral URLs, signed eligibility, ledger

## Constraints

- Direct `payTo` = seller receiving address (full list price on native)
- Escrow holds real USDC; remit is an app call with inner ASA transfers
- Referral eligibility is checked by `@vouch/backend` (not trustless on-chain)
- Upstream URLs stay private
- No invented customers / mainnet claims
- Live on-chain settle is the primary demo (not simulate)

## Brand Commitments

- Name: **Vouch**
- Network: Algorand Testnet
- Visual: payment-slip × Pera connect — cool silver, black CTAs, blue signal

## Voice

Direct, technical, concrete.
