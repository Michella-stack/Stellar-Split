# 0005. The person signs the link to their agent

- **Status:** Accepted, 2026-10-25. Decided by Victor Estival. Real-browser signing is not verified yet. Not yet reviewed by the rest of the team.
- **Related:** ADR 0001, 0004, `docs/DELEGATED-PAYMENTS.md`, `apps/web/src/wallets/freighter/README.md`.

## Context

ADR 0004 lets the chain verifier accept an agent's address as the payer for a person's debt. If the link between person and agent were only a database row, anyone able to edit that table could link an address they control to someone else's account and have their payments recorded as that person's.

## Decision

1. An agent is `pending_link` when created. It can read but cannot pay.
2. To activate it, the **owner signs a challenge with their own Freighter-controlled address**. The challenge contains the agent's address, the owner's address, the application's origin, the network, a random nonce and an expiry.
3. The API verifies the signature and the expiry, stores the challenge and the signature (`agents.link_challenge`, `link_signature`) and sets the agent `active`. The database refuses `active` without them.
4. Unlinking is done by the owner from the web app, with the same session and address checks. It is immediate and cancels any open intent that is only `reserved`.
5. Pausing or revoking is the one change an owner can make straight from the browser (row level security allows only `status` to `paused` or `revoked`).

## How the signature is made

The web application already signs a sign-in challenge with a **SEP-53 signed message** through Freighter's message signing (`apps/web/src/wallets/freighter/adapter.js`, `signMessage`). The adapter refuses any text that is not the exact sign-in format, so a page cannot get arbitrary text signed.

Decision: the link uses the same mechanism, with a second message kind (`link-agent`) in a fixed format that the adapter also checks before asking Freighter. The API creates the challenge and verifies the signature.

Still to verify:

- the adapter's tests mock Freighter, so signing has not been seen working in a real browser with a real wallet;
- the fixed message format for `link-agent`, which must name the agent's address, the owner's address, the application's origin, the network, a nonce and an expiry.

Fallback if message signing proves unreliable: a challenge transaction that is never submitted, in the style of SEP-10, signed with the existing transaction signing call.

## Consequences

- Linking an agent to a person needs a human at a wallet. It cannot be done by an agent or by a database edit.
- Signed challenges are evidence in a dispute about who authorised an agent.
- One more screen and one more wallet prompt for the owner.

## Alternatives considered

- **Link by Telegram user ID or email only.** Easy, but Telegram IDs are not proof of control of a Stellar account, and the allowlist is a messaging control, not an authorisation one.
- **Record the link on chain** (a contract call by the owner). Strongest, and part of the same family as ADR 0006. Too much for the hackathon.
