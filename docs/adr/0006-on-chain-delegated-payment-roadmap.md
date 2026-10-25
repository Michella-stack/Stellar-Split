# 0006. On-chain delegated payment (token allowance) is the roadmap, not the demo

- **Status:** Accepted as a roadmap item on 2026-10-25. Not scheduled. Decided by Victor Estival. Not yet reviewed by the rest of the team.
- **Related:** ADR 0004, `docs/stories.json` story 20 ("Agent smart accounts with on-chain spending limits"), `docs/DELEGATED-PAYMENTS.md`.

## Context

ADR 0004 enforces the agent's caps in the API and limits the loss to the agent's small float. The PRD already plans on-chain limits for phase 2. The aim is that a compromised API or agent key cannot spend more than the owner allowed, and that the owner can cut it off on chain.

## Decision

Pursue **option C: a token allowance** as the first on-chain mechanism.

1. The owner approves the agent's address as a spender of the group's USDC token for a limited amount and until a given ledger (SEP-41 `approve(from, spender, amount, expiration_ledger)`).
2. The agent pays the creditor with `transfer_from`. The token itself enforces the amount and the expiry. The owner revokes it by approving 0.
3. The API still records the settlement as in ADR 0004 and still uses the intent lock of ADR 0003.
4. If the allowance route turns out not to fit x402, fall back to option B (a delegate registered in the group contract with a cap and expiry).

## Not verified, to check before committing to it

- That the Stellar Asset Contract for the demo USDC supports `approve` and `transfer_from` as described by SEP-41 (the interface is documented, the behaviour on this asset has not been tried).
- That the x402 `exact` scheme can carry a spender-authorised transfer. The installed `@x402/stellar` client signer signs authorisation entries for the payer's own transfer, so this is probably not supported as is.
- Whether a plain allowance-based payment, outside x402, is enough for the product.

## Consequences

- The cap is enforced by the token, not by our server.
- The owner can revoke on chain without our help.
- It does not by itself close the gap between the token transfer and the ledger record. Closing it needs one atomic contract call, which is the contract change of option B, so the intent lock of ADR 0003 stays either way.
- Needs the owner's signature for each allowance, one more wallet prompt.

## Alternatives considered

- Staying with ADR 0004 only. Acceptable for a testnet demo, weaker than the PRD's goal for anything beyond it.
- Smart accounts with policy signers (story 20). More general and more work. Option C is the smaller step towards it.
