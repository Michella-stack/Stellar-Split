# Architecture decision records

Use ADRs for choices that affect security, interoperability, data ownership, or multiple components.

Name records `NNNN-short-title.md` and include: status, context, decision, consequences, and alternatives considered. Accepted ADRs are append-only; supersede them with a new record rather than rewriting history.

## Index

| Record | Status |
|---|---|
| [0001 Agent identities are sponsored by a person](0001-agent-identities-are-sponsored-by-a-person.md) | Accepted |
| [0002 Shared agents for the demo](0002-shared-agents-for-the-demo.md) | Accepted, demo owner not named |
| [0003 One open settlement intent per debt](0003-one-open-settlement-intent-per-debt.md) | Accepted |
| [0004 The agent pays on behalf and the API records it](0004-agent-pays-on-behalf-and-the-api-records-it.md) | Accepted, stretch path |
| [0005 The person signs the link to their agent](0005-the-person-signs-the-link-to-their-agent.md) | Accepted, real-browser signing to verify |
| [0006 On-chain delegated payment is the roadmap](0006-on-chain-delegated-payment-roadmap.md) | Accepted as roadmap, not scheduled |
| [0007 The web app is a Vite single-page app](0007-web-vite-spa.md) | Accepted (first numbered 0001, renumbered to remove the duplicate) |
| [0008 More wallets after Freighter are a roadmap item](0008-more-wallets-after-freighter-is-roadmap.md) | Accepted as roadmap, paused |
| [0009 The MCP server runs next to each agent, not on Vercel](0009-mcp-server-runs-next-to-each-agent.md) | Accepted |
| [0010 One settlement asset per group: USDC or EURC](0010-one-settlement-asset-per-group.md) | Accepted, not yet tested with a real payment |
