# 0003. One open settlement intent per debt

- **Status:** Accepted, 2026-10-25. Decided by Victor Estival. Not yet reviewed by the rest of the team.
- **Related:** `docs/ARCHITECTURE.md` sections 5 to 7 (settlement intent, rule 8), `docs/DELEGATED-PAYMENTS.md`, `docs/schema/delegated-payments.sql`.

## Context

Two payers can try to settle the same debt: the person with Freighter and, once agents can pay, their agent. Two browser tabs or a retry can do the same. An on-chain transfer is final. The group contract protects the contract path: `settle` updates balances and moves the token in one transaction, so a second `settle` fails with `Overpay` before any money moves. The required first demo is a plain USDC transfer followed by a verification and a record, and the x402 path is a transfer followed by `record_x402_settlement`. In both, the money moves before the ledger finds out, so the second payment would be sent and only then rejected.

## Decision

1. Every payment, human or agent, starts by **reserving a settlement intent** through the API before any signature is requested.
2. At most **one open intent exists per (group, debtor, creditor)**. Open means `reserved`, `signed` or `submitted`. The database enforces this with a partial unique index (`one_open_intent_per_debt`), so two simultaneous requests cannot both win. The loser receives `409 intent_in_progress`.
3. The intent states are `reserved`, `signed`, `submitted`, `settled`, `failed`, `expired`, `cancelled` and `needs_review`. Legal transitions are fixed in a database trigger. Terms (amount, asset, parties, payer) cannot change after reservation. Intents are never deleted.
4. A `reserved` intent expires by itself after 10 minutes. A `signed` or `submitted` intent never expires by itself: it may already be paid, so it is closed only after the chain has been checked.
5. A `reserved` intent can be cancelled by the debtor. A `signed` one cannot.
6. A transaction hash can complete at most one intent (unique `tx_hash`), as ARCHITECTURE rule 8 already says.
7. If the transfer is confirmed on chain but the ledger refuses to record it (for example the balance changed meanwhile), the intent becomes `needs_review` and an operator resolves it. No state silently loses a payment.
8. Idempotency keys are unique per payer address, so a retry returns the same intent.

## Consequences

- The window for paying twice shrinks to a bug in the reservation code, not a race between two payers. This was checked with 30 parallel connections for one debt: 1 succeeded and 29 failed.
- Payments are sequential per debt. A partial payment needs the previous intent to close first.
- A crashed signer or a lost response can leave an intent `signed` until a reconciliation job checks the chain. That job is part of the agent path and is not built.
- The same mechanism protects the required human demo, not only agents.

## Alternatives considered

- **Rely only on the contract's `Overpay` check.** It does protect the contract `settle` path, but not the plain transfer or x402 path, where the money has already moved.
- **A lock held in memory or in the browser.** Lost on restart and invisible to the second payer.
- **Allow several open intents and check the sum.** More flexible for partial payments, but it needs locking across rows and gives a harder guarantee to test.
