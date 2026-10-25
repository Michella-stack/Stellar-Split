# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: open the **Security** tab of this repository and click **Report a vulnerability**. Do not open a public issue for a security problem.

Include what you found, how to reproduce it, and the impact you expect.

## Scope

In scope:

- Soroban contracts under `/contracts`
- The app, API and MCP server code in this repository
- GitHub workflows and the supply chain checks under `/.github` and `/supply-chain`

Out of scope:

- Bugs in Stellar, Soroban, x402 or other upstream projects (report those upstream)
- Testnet funds and test accounts

## Trust assumptions

What each part can and cannot do today (Stellar Testnet only, no real money):

- **The app never holds funds or keys.** A person's key stays in Freighter. Every payment is signed there and goes straight from the debtor to the creditor.
- **The API** can refuse service or record wrong data in the off-chain ledger, but it cannot move funds. It records a settlement only after Horizon shows a matching USDC payment with the reserved intent's memo.
- **The Supabase service role key** is held only by the API (server side). The browser gets no database credential.
- **The group contract admin** is a single developer key on Testnet, and the deployed contract is not used for settlement yet. Mainnet requires the multisig and timelock in PRD section 9.2.
- **The contract recorder key** can record an x402 settlement but cannot move tokens. Recorded hashes are not yet re-checked by a reconciler (threat model T-21), so do not rely on the contract's records for anything beyond Testnet.
- **Agents** run in containers with no Stellar key. Each agent's Testnet account key stays on the host, outside the container (`docs/AGENT-WALLETS.md`). Agent payments are a stretch goal.
- **The x402 facilitator**, once used, can censor but cannot steal: it only submits authorizations that the payer signed.

The full threat model is in [`docs/security/threat-model.md`](docs/security/threat-model.md).

## Response target

- First reply within 3 working days
- Triage and severity rating within 7 days
- A fix or a mitigation plan for high and critical issues within 30 days

## Release signing key

The GPG fingerprint used to sign release tags and artifacts will be published here and in `README.md` with v0.1.0.
