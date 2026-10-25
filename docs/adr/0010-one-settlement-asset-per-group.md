# 0010. One settlement asset per group: USDC or EURC

- **Status:** Accepted, 2026-10-25. Decided by Victor Estival and built by Michella Warren (PR #105, issue #98). Not yet tested with a real EURC payment through Freighter.
- **Related:** ADR 0003, `docs/DEPLOYMENT.md`, `database/migrations/003_group_asset.sql`, issue #98.

## Context

Stellar-Split settled only in Testnet USDC. Many users think in euros, and Circle issues EURC on Stellar. Balances are plain decimal amounts with no asset next to them, so mixing two assets in one group would add dollars and euros.

## Decision

1. A group settles in **one asset, USDC or EURC**, chosen when it is created and fixed afterwards. Nothing converts between them.
2. The asset is stored on the group (`groups.asset`, nullable). **Null means USDC**, so every existing group is unchanged.
3. The API checks payments against the group's asset and issuer. A payment in the other asset, or from another issuer, is `PAYMENT_MISMATCH`. A group whose asset is not configured on the server is refused with 503, never treated as USDC.
4. EURC is **optional and off until configured**: `EURC_ISSUER` for the API, `VITE_EURC_ISSUER` for the web build, and migration 003 in the database.
5. Totals of groups in different assets are reported apart (`otherTotals`), never added.
6. Before signing, the web app compares the asset code and issuer in the settlement intent with the asset it is about to pay in, and stops on a mismatch.

## Consequences

- Existing groups, tests and integrations keep working with no change.
- Agent spend caps (25 per payment, 50 per day, 200 per 30 days) are plain numbers. They count the group's own asset as the same unit and across all of an agent's groups, so a euro counts as a dollar. This is a known simplification, not a decision to convert.
- A new asset later means another entry in the allowed list, an issuer setting and a trustline, not a new model.
- Demo accounts get EURC from Circle's faucet: the Testnet DEX has almost none.

## Alternatives considered

- **One asset per expense.** More flexible, but a group's balance would mix assets and need a rate. Rejected for now.
- **Convert at a rate.** Needs a rate source and a rule for who bears the difference. Rejected; the estimates in the home currency stay display only.
- **Store the asset on every intent.** Redundant while a group's asset cannot change.
