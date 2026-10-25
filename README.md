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
- Stack: JavaScript (ES modules, JSDoc), a Vite + React web app with Tailwind CSS, a Node.js API, and Supabase (PostgreSQL) for the off-chain ledger.

### Deployed on Stellar Testnet

| Item | Value |
|---|---|
| Group contract | [`CAZDOCJJR3NU5O2N44KQSWUG7C4OBLC6PIQLBFVPXODAYHHITFU7FR3Y`](https://stellar.expert/explorer/testnet/contract/CAZDOCJJR3NU5O2N44KQSWUG7C4OBLC6PIQLBFVPXODAYHHITFU7FR3Y) |
| Deploy transaction | [`56a42289…095fbe6a`](https://stellar.expert/explorer/testnet/tx/56a42289418586c90efec1a09ce36e70a152988067e2c7268fc9b2ec095fbe6a) (25 October 2026) |
| WASM hash | `ca6ba904c5759a963a3b08611a8d4519aa6a8e75670dacab873ace8fe27463e4` |
| Admin and recorder | `GCOURV2JXCIXK3CHXMJ4HBOPS5TMWGLL4AVKTO6A44DYYDJE2FA5I4N4` |

Group 1 on this contract is a smoke test that uses native XLM, not USDC. The Testnet USDC asset and the settlement transaction used in the demo will be listed here.

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

**Live URL: https://stellar-split-sooty.vercel.app** (Stellar Testnet only). API health: [`/v1/health`](https://stellar-split-sooty.vercel.app/v1/health).

The web app and the API run as one Vercel project. How it is built, how every commit is meant to deploy by itself, what is configured and the current status are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Demo steps and the Testnet transaction evidence will be added here.

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
- [Deployment on Vercel](docs/DEPLOYMENT.md)
- [Group contract](contracts/README.md)
- [Security policy](SECURITY.md)
- [Supply chain checks](supply-chain/README.md)

## Release signing key

Planned after the hackathon: release tags and artifacts will be signed with the owner's GPG key, and the key fingerprint will be published here and in `SECURITY.md`.

## Team

Michella Warren, Victor Estival, Damaris Castro, Viviana Andrango, Sofiia Varich.

## Licence

MIT. See [`LICENSE`](LICENSE).
