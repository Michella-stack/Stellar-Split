# 0009. The MCP server runs next to each agent, not on Vercel

- **Status:** Accepted, 2026-10-25. Decided by Victor Estival. Not yet reviewed by the rest of the team.
- **Related:** `docs/AGENT-MCP-ROLLOUT.md`, `docs/AGENT-WALLETS.md`, `docs/AGENTS.md`, ADR 0002, issues #14, #15 and #18, PRD section 7.2 (FR-38).

## Context

Hermes and OpenClaw run as containers on the private agent host. The MCP server in `mcp/` gives them tools (list groups, read balances, create an expense, propose a settlement) and talks to the Ledgerly API, which runs on Vercel. The MCP server needs two secrets: the API token that identifies the agent, and later the signing key for agent payments. The model and its plugins must never see either.

## Decision

1. The MCP server runs as **one container per agent on the agent host**, in its own Docker Compose project, for example `ledgerly-mcp-hermes` and `ledgerly-mcp-openclaw`.
2. Each agent has **its own API token, its own `MCP_AUTH_TOKEN` and its own internal Docker network** shared only with its MCP container. The agent container keeps its current network and also joins that one, because an internal network has no way out. The MCP container also reaches the public API over HTTPS. The agent container never holds the API token; it holds `MCP_AUTH_TOKEN`, which sits in its own configuration.
3. The MCP server is not published on the LAN, through the tunnel or on the internet.
4. The container runs non-root, with a read-only filesystem, `cap_drop: ALL` and `no-new-privileges`.
5. When agent payments exist, the signer stays in this same container, as `docs/AGENT-WALLETS.md` proposes.

## Consequences

- The API credential and, later, the signing key are outside the agent container, so a prompt injection or a bad plugin cannot read them.
- `MCP_AUTH_TOKEN` is readable by the agent, so approval prompts in Hermes and OpenClaw are advisory: an agent with a shell, file or HTTP tool could call the MCP server directly. The real limits are the API's membership checks and spend caps, and the absence of a pay tool until #14.
- The API tells the two agents apart, caps them separately and can have one token replaced without touching the other.
- The agent host needs an image for the MCP server. `mcp/` has no Dockerfile yet and the host has no Node, so one must be added and built there.
- The MCP server depends on the agent host and the API both being up. If the host is down, the agents are down anyway.
- Every new agent identity needs its own container, network and token.

## Alternatives considered

- **Run the MCP server as a function on Vercel next to the API.** Easier to operate and update. Rejected: it must be reachable from the internet with one Bearer token in front of it, the agents would call out across the internet to reach their own tools, and the future signing key could not live there away from the API.
- **One MCP container shared by both agents.** Fewer containers. Rejected: one token would stand for both agents, so the API could not cap or revoke them separately, and a leak would affect both.
- **Run the MCP server inside each agent container, over stdio.** No network hop. Rejected: the token and the key would sit in the same container as the model and its plugins, which is what FR-38 forbids.
