# Build focus for HackMeridian

Status: draft for the team to agree. Date: 25 October 2026.
Source: Victor Estival's PRD v0.3 (`docs/PRD.md`), cut down to what can be built and demonstrated during the event.

## Prior work disclosure

Before the event the team wrote the PRD (v0.3, dated 25 October 2026) and reviewed public literature on remittances and stablecoins (sources are linked in the README). No application code for this project was written before the event. Raven, a separate earlier Testnet prototype by Michella, is not part of this repository.

## One-line pitch (to agree)

Split shared costs, such as rent sent home by family, and settle them in USDC on Stellar, with agents able to take part. Choose one headline before the demo:

- Option A, family money: "Rent from home, split and settled in seconds."
- Option B, agents: "Shared expenses where humans and AI agents both pay."

## What we build (priority order)

1. **Group and members.** Create a group, connect a Freighter wallet, add a second member by Stellar address. (PRD FR-01 to FR-03)
2. **Expenses.** Equal and exact-amount splits. The server rejects splits that do not sum to the total. Expenses are append-only. (FR-10 to FR-12)
3. **Balances.** Per-member net position, checked against a hand calculation for 3 members and 5 expenses in a test. (FR-20)
4. **One real Testnet settlement.** A debtor pays a creditor in Testnet USDC. The transaction hash is shown and links to a Testnet explorer. This is the required on-chain evidence. (FR-22, FR-25)
5. **Agent settlement through x402 (stretch).** One agent pays a settlement over x402 on `stellar:testnet`, within a spend cap. Only start this once items 1 to 4 work. (FR-32, FR-33)

Decision: settle with a plain USDC transfer plus an off-chain ledger first. The Soroban group contract in `contracts/group` is written; switching the human settlement to its `settle` function comes once the plain transfer works.

Stack decision: JavaScript (ES modules, JSDoc) for the web app and API, a Vite + React single-page web app, and Supabase (PostgreSQL) for the off-chain ledger.

## Security basics we keep

- No secret keys anywhere: reject anything matching `S[A-Z2-7]{55}`.
- Testnet only. Refuse to act if the wallet is on another network.
- Validate every amount: positive, at most 7 decimals, within balance.
- Lockfiles committed, exact dependency versions, secret scanning and push protection on.
- `SECURITY.md` and `.env.example` present. No real secrets in the repo.

## Deferred to future work

Signed releases and SLSA provenance, Scorecard targets, fuzzing and formal verification, multisig admin and timelock, Hermes agent test plan, approvals and velocity checks, OAuth and webhooks, mainnet, fiat on-ramps and bank integrations (non-goal NG1 in the PRD).

## What we still need to confirm

- A Testnet API key for the x402 facilitator (OpenZeppelin), kept in a local `.env` only.
- A funded Testnet account that receives payments, with a USDC trustline.
- Funded Testnet accounts for each demo user.
- That Freighter can sign the authorisation entries x402 needs in the browser. Unverified.

## Submission checklist

- [ ] Public GitHub repo with source code
- [ ] README: summary, problem, setup, environment variables, demo steps
- [ ] Architecture overview: how Stellar is used, assets, contract IDs, integrations
- [ ] Live demo URL or video walkthrough
- [ ] Testnet transaction hash as evidence
- [ ] Prior-work disclosure (above)
- [ ] Track: Genesis, with Stellar Composed for combining wallet, USDC and x402

## Who does what (fill in)

| Area | Owner |
|---|---|
| Contract or settlement logic | |
| API and balances | |
| Web app and wallet connection | |
| x402 and agent | |
| README, demo video, pitch | |
