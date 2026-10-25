# 0002. Shared agents for the demo

- **Status:** Accepted, 2026-10-25, with one open item: the demo owner has not been named. Decided by Victor Estival. Not yet reviewed by the rest of the team.
- **Related:** ADR 0001, `docs/AGENTS.md`, `docs/AGENT-WALLETS.md`.

## Context

Hermes and OpenClaw each run as one container on the private agent host and each has one funded testnet account. The team does not yet know who will present the demo and wants everyone to be able to talk to the agents. ADR 0001 says one agent belongs to one person.

## Decision

1. For the hackathon, the Hermes and OpenClaw identities are **shared demo agents** (`agents.shared_demo = true`). They are an exception to the one-agent-per-person rule and are meant to be temporary.
2. Every allowlisted team member may read balances, create expenses and ask for a settlement proposal through a shared agent.
3. A shared agent has **one owner**, who for now is the person presenting the demo. Only the owner's debts can be paid by it. A payment request from anyone else is refused, or turned into an approval request to the owner, according to the policy engine once it exists.
4. The float of a shared agent is small: at most 50 USDC, and demo amounts of 5 USDC or less.
5. After the demo each person gets their own agent identity and wallet, even if several identities share one Hermes or OpenClaw runtime. Each identity then has its own signer container (PRD 7.4).

## Consequences

- Everyone can try the agents without the demo mixing money from several people.
- Someone must be named owner before any payment is tested with a shared agent. Until then the shared agents can only read and propose.
- The Telegram allowlist (who can reach the model) and the payment owner (whose debts can be paid) are separate controls and must stay separate.

## Alternatives considered

- **One wallet per person from the start.** Cleaner, but it needs more accounts, trustlines and USDC from a faucet with a captcha, which is a poor use of the time before the demo.
- **A shared pool anyone can spend from.** Rejected for the reasons in ADR 0001.
