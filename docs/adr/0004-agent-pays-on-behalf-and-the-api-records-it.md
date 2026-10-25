# 0004. The agent pays on behalf of its owner and the API records it (option A)

- **Status:** Accepted, 2026-10-25, for the agent settlement stretch path. Decided by Victor Estival. Not yet reviewed by the rest of the team.
- **Related:** ADR 0001, 0003, 0005, 0006, `contracts/README.md` (`record_x402_settlement`), `docs/security/threat-model.md` (T-21, T-22), `docs/DELEGATED-PAYMENTS.md`.

## Context

The group contract's `settle(group, from, to, amount)` moves the token from the debtor and requires the debtor's authorisation. It cannot be called by an agent with its own address on behalf of the debtor. The contract also has `record_x402_settlement(group, from, to, amount, tx_hash)`, which only the recorder can call. It updates the balances without moving a token and rejects a repeated `tx_hash`. The recorder trusts that the API verified the payment on chain.

Agent settlement through x402 is a stretch goal. The required demo is a human paying with Freighter.

## Decision

1. The agent pays from **its own account** directly to the creditor's registered address, either as a plain USDC transfer or through x402.
2. The API's chain verifier accepts as payer either the debtor's own address or the address of an **active agent whose owner is the debtor** (ADR 0001 and 0005). It checks network, asset, destination, amount, success and that the transaction hash is unused.
3. After verification the API calls `record_x402_settlement(group, from = debtor, to = creditor, amount, tx_hash)`. The ledger therefore credits the debtor, and the receipt states who actually paid ("paid by agent X on behalf of Y").
4. This needs **no change to the contract**.
5. Every agent payment goes through a reserved settlement intent (ADR 0003) and the agent's caps from the PRD (25 USDC per payment, 50 per day, 200 per month, approval above 5 USDC), enforced by the API.
6. The recorder key is an API server secret. It never reaches the browser, an agent container or the repository.

## Consequences

- Fast to build and independent of contract work owned by someone else.
- The on-chain record shows the debtor as `from`, while the token transfer visible on the explorer comes from the agent's address. This must be explained in the receipt and the demo.
- **The recorder key is a high-value secret.** It cannot move funds, but whoever holds it can write settlement records that rebalance the groups (threat model T-21). Today the deployed contract's admin and recorder are the same account and the contract has no function to rotate either (T-22). Mitigations that exist or are planned: the API records only transfers it has verified on chain, a repeated hash is rejected by the contract, the contract can be paused with `set_paused`, the key never leaves the server, and the reconciliation job of T-21 (issue #21, not built) re-checks every recorded hash. If the key is lost or leaked on testnet, the recovery is a new contract deployment. A rotation function and separate admin and recorder keys are contract work for the contract owner. A runbook is still to be written (`docs/runbooks/`).
- The spending cap is a policy of the API plus the agent's small float. It is not enforced on chain until ADR 0006.
- A compromised agent can still waste its own float on a legitimate-looking debt payment. The loss is bounded by the float, and it never pays a debt that is not its owner's.

## Alternatives considered

- **B. Delegates inside the contract.** The owner registers the agent as a delegate with a cap and expiry, and the contract accepts the delegate's payment against the owner's debt. Stronger, but it changes `contracts/group`, which is under the owner's code review, and it is not needed for the demo. Kept as a fallback for ADR 0006.
- **Make the agent a signer on the person's own Stellar account.** Classic multisig cannot cap the amount, so a compromised agent key could drain the whole account. Rejected.
