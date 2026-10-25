# Stellar-Split

Split shared expenses and settle them in USDC on Stellar, built for families and workers who send money across borders, with agent support via x402.

Built at HackMeridian (Lisbon, 25 to 26 October 2026). Track: Genesis, with Stellar Composed.

> **Status: early stage.** The plan and design are written. Application code is being built during the event, and this README will be updated as it lands. Everything runs on **Stellar Testnet only**. No real money is involved and nothing here is financial advice.

## Summary

Shared-expense apps record who owes whom, but the money still moves outside the app. Stellar-Split keeps the ledger and the settlement together: a group records expenses, sees who owes whom, and settles in USDC on Stellar. Money goes directly from the person who owes to the person owed. The app never holds user funds.

## Problem

Many people support family across borders or are paid in a way that makes cashing out difficult. Sending money is often costly and slow, and splitting a shared cost, such as rent paid with money sent from family, happens by hand.

Context from public sources (to be checked before the pitch; see `docs/BUILD-FOCUS.md`):

- Remittances to Mexico reached a record $64.7bn in 2024 and fell about 5% in 2025, the biggest drop since 2009 ([FXC Intelligence](https://www.fxcintel.com/research/analysis/us-mexico-remittances-2025)).
- A 1% US tax on remittances funded by cash, money orders or cashier's cheques started on 1 January 2026. Transfers funded from a bank account or card are exempt ([BBVA Research](https://www.bbvaresearch.com/en/publicaciones/mexico-2026-begins-with-new-remittance-tax/)).
- Stablecoin remittance flows on Stellar already exist, for example Felix Pago with Bitso using USDC ([Stellar case study](https://stellar.org/felix-bitso)).

## Planned scope for the hackathon

1. Create a group and connect a Freighter wallet.
2. Record expenses with equal or exact splits.
3. Show each member's balance.
4. Settle one real Testnet USDC payment, with the transaction hash shown.
5. Stretch: an agent settles through x402 within a spend cap.

The full plan, what is deferred, and the submission checklist are in [`docs/BUILD-FOCUS.md`](docs/BUILD-FOCUS.md).

## Architecture (planned)

- Web app with Freighter for signing, so the app never sees a secret key.
- API for groups, expenses and balances.
- Settlement as a plain USDC transfer on Stellar Testnet first. A Soroban group contract is written in [`contracts/group`](contracts/README.md); settling through its `settle` function comes after the plain transfer works.
- x402 on Stellar (the `exact` scheme with a facilitator) for agent payments (stretch).

Contract IDs, assets and integration details will be listed here once confirmed for the demo.

## Setup

The Soroban contract can be built and tested now; see [`contracts/README.md`](contracts/README.md). Install and run steps for the web app and API will be added with their first code.

### Environment variables (planned)

Copy `.env.example` to `.env` when it exists. Never commit `.env`.

| Variable | Purpose |
|---|---|
| `STELLAR_NETWORK` | `testnet` |
| `HORIZON_URL` / `SOROBAN_RPC_URL` | Testnet endpoints |
| `X402_FACILITATOR_URL` | x402 facilitator for Testnet |
| `X402_FACILITATOR_API_KEY` | Facilitator key. Server-side only, never in the browser |

## Demo

Demo steps, the live URL and Testnet transaction evidence will be added here.

## Security

Design rules the code must follow (enforced as each part lands):

- Testnet only. The app refuses to act if the wallet is on another network.
- No secret keys are collected, stored or logged.
- Amounts are validated: positive, at most seven decimals, and within balance.
- Secrets live only in a local `.env`, which is ignored by git.

## Docs

- [Product requirements](docs/PRD.md) (written under the working name Ledgerly)
- [Judging criteria](docs/JUDGING.md)
- [Build focus](docs/BUILD-FOCUS.md)
- [Agents: setup and access](docs/AGENTS.md)
- [Group contract](contracts/README.md)
- [Security policy](SECURITY.md)
- [Supply chain checks](supply-chain/README.md)

## Release signing key

Planned after the hackathon: release tags and artifacts will be signed with the owner's GPG key, and the key fingerprint will be published here and in `SECURITY.md`.

## Team

Michella Warren, Victor Estival, Damaris Castro, Viviana Andrango, Sofiia Varich.

## Licence

MIT. See [`LICENSE`](LICENSE).
