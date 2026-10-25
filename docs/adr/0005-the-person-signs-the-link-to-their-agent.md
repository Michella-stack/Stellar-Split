# 0005. The person signs the link to their agent

- **Status:** Accepted, 2026-10-25. Decided by Victor Estival. The signing method is not verified yet. Not yet reviewed by the rest of the team.
- **Related:** ADR 0001, 0004, `docs/DELEGATED-PAYMENTS.md`, `apps/web/src/wallets/freighter/README.md`.

## Context

ADR 0004 lets the chain verifier accept an agent's address as the payer for a person's debt. If the link between person and agent were only a database row, anyone able to edit that table could link an address they control to someone else's account and have their payments recorded as that person's.

## Decision

1. An agent is `pending_link` when created. It can read but cannot pay.
2. To activate it, the **owner signs a challenge with their own Freighter-controlled address**. The challenge contains the agent's address, the owner's address, the application's origin, the network, a random nonce and an expiry.
3. The API verifies the signature and the expiry, stores the challenge and the signature (`agents.link_challenge`, `link_signature`) and sets the agent `active`. The database refuses `active` without them.
4. Unlinking is done by the owner from the web app, with the same session and address checks. It is immediate and cancels any open intent that is only `reserved`.
5. Pausing or revoking is the one change an owner can make straight from the browser (row level security allows only `status` to `paused` or `revoked`).

## How the signature is made (to verify)

Two ways exist and neither has been tested with the team's Freighter version:

1. a message signature, if the reviewed Freighter release supports signing arbitrary messages; or
2. a challenge transaction that is **never submitted**, in the style of SEP-10, signed with the existing transaction signing call.

Option 2 only needs functions the architecture already assumes, so it is the fallback. The choice must be verified against the pinned Freighter package before code is written, as the Freighter adapter README already requires.

## Consequences

- Linking an agent to a person needs a human at a wallet. It cannot be done by an agent or by a database edit.
- Signed challenges are evidence in a dispute about who authorised an agent.
- One more screen and one more wallet prompt for the owner.

## Alternatives considered

- **Link by Telegram user ID or email only.** Easy, but Telegram IDs are not proof of control of a Stellar account, and the allowlist is a messaging control, not an authorisation one.
- **Record the link on chain** (a contract call by the owner). Strongest, and part of the same family as ADR 0006. Too much for the hackathon.
