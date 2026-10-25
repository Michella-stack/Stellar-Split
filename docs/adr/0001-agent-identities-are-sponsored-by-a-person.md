# 0001. Agent identities are sponsored by a person

- **Status:** Accepted, 2026-10-25. Decided by Victor Estival (project owner). Not yet reviewed by the rest of the team.
- **Related:** `docs/PRD.md` section 4 (agent identity) and 7.4, `docs/DELEGATED-PAYMENTS.md`, ADR 0002, 0004, 0005.

## Context

The PRD already defines an agent identity as a member whose actions are performed by software, with an owner (a human member), its own Stellar keypair, an API credential and a policy. The team wants an agent to be tied to one person: the person has an account, the agent has its own account related to it, and either can pay that person's debt.

## Decision

1. An agent identity belongs to exactly one person (`agents.owner_id`). It is never ownerless.
2. An agent acts for its owner only. In this version it can pay the owner's debts and create expenses in the owner's groups. It cannot pay another person's debt.
3. Each agent has its own Stellar account and its own spend policy. Its funds are the owner's money. Nothing is owed between an agent and its owner.
4. The target model is one live agent per person and runtime. The database enforces it (`one_live_agent_per_owner_runtime`).
5. The owner can pause or revoke the agent at any time. Nobody else can.
6. A Telegram user is mapped to a person (`people.telegram_user_id`). The agent applies the policy of the person who is asking, not the owner's, and never grants a member more than that member's own rights.

## Consequences

- Accounting stays simple: a debt is always a person's debt, whoever pays it.
- Compromising an agent exposes only its float and its owner's debts, not other members.
- More wallets to create and fund (one per person) once the shared demo agents are split. See ADR 0002.
- A person who has no agent simply pays with Freighter. Agents are optional.

## Alternatives considered

- **Agent as an independent member with its own balances and debts.** This is the reading of the PRD where an agent buys things for the group. It stays possible for a later agent that creates expenses, but it does not answer "pay my debt" without mixing balances, so it is not used for delegated payment.
- **One agent for the whole group, funded by a shared pool.** Rejected: it mixes money of several people and makes it unclear who loses when something goes wrong.
