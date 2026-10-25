# Security documents

PRD section 9 ("Security 360") is the design. The files here are the working record of how well the repository matches it.

| File | What it is |
|---|---|
| [`threat-model.md`](threat-model.md) | Assets, trust boundaries, risk-rated threat register with status and evidence, decisions needed, and what can be claimed publicly. |
| [`verification-policy.md`](verification-policy.md) | Draft payment verification tiers (over 2 and over 40), the Hermes role, new-user binding, and the reasoning behind each number. |
| [`references/`](references/README.md) | Bibliography and a table of recent breaches and fraud cases, with links and confidence notes. |
| [`diagrams/`](diagrams/README.md) | Mermaid workflow charts for the security workflow and the verification flow, for the team to edit. |

Related, elsewhere:

- [`/SECURITY.md`](../../SECURITY.md): how to report a vulnerability (stays at the root so GitHub shows it).
- [`/supply-chain/`](../../supply-chain/): the version guard and approved versions, enforced in CI.
- [`/docs/AGENT-WALLETS.md`](../AGENT-WALLETS.md): agent key custody and the settle flow.
- [`/docs/TESTING.md`](../TESTING.md): what is tested today and the gaps.
