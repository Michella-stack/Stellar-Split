# Agent interface (MCP) - phase 1a, part 1

Status: the read, expense and propose tools are built in `mcp/`. It follows PRD section 7 and does not change it. The signer and `ledgerly_settle` are also Phase 1a in the PRD and in story 14, but are not built yet. See `docs/AGENT-WALLETS.md`.

Agents (Hermes, OpenClaw) reach Ledgerly through an MCP server that runs on the agent host and talks to the Ledgerly API with a per-agent credential.

```
Telegram group -> Hermes / OpenClaw -> ledgerly-mcp (HTTP, same host) -> Ledgerly API -> Soroban contract
```

## What is built

| Tool | Spends money | Built |
|---|---|---|
| `ledgerly_list_groups` | No | Yes |
| `ledgerly_get_balances` | No | Yes |
| `ledgerly_create_expense` (equal and exact splits) | No | Yes |
| `ledgerly_propose_settlement` | No | Yes (dry run only) |
| `ledgerly_get_approval` | No | Yes |
| `ledgerly_settle` (x402 payment, agent signer) | Yes | **No.** Next, still Phase 1a |

There is no signing code and no key handling in this phase. The MCP server cannot move money.

## API contract the server expects

This is the contract `mcp/src/api.js` calls. Items marked **to confirm** are not in the PRD and need the API owner to agree.

| Call | Success | Notes |
|---|---|---|
| `GET /v1/groups` | 200 `{ groups: [...] }` | Groups of the credential's agent identity |
| `GET /v1/groups/{id}/balances` | 200 `{ balances: [{ member, net }] }` | `net` is a decimal string, positive = is owed |
| `POST /v1/groups/{id}/expenses` | 201 `{ id }` | Body `{ payer, amount, description, split }`. `Idempotency-Key` header required. Server rejects splits that do not sum to `amount` |
| `POST /v1/groups/{id}/settlements?dry_run=true` | 200 `{ intent, requirements }` or 202 `{ status: "pending_approval", approval_id }` | **To confirm.** Dry run returns the intent and x402 requirements without a 402 and without paying |
| `GET /v1/approvals/{id}` | 200 `{ id, status }` | |

Errors: any non-2xx with `{ code, message }`. Policy denials use 403 (`policy_*` codes), revoked credentials 401. The MCP server passes `code` and `message` to the agent and never the credential.

Auth: `Authorization: Bearer <agent API credential>`. The API enforces spend policy, group scope and the approval threshold server-side (FR-33, section 7.4). The MCP server does not trust the agent and does not enforce policy itself.

## Input rules (enforced before any API call)

- Amounts are positive decimal strings with at most 7 decimals and at most 12 integer digits.
- IDs match `^[A-Za-z0-9_-]{1,64}$`.
- Text that looks like a Stellar secret key (`S` plus 55 base32 characters) is rejected.
- Exact splits must add up to the total, checked with integer arithmetic.

## Run

```sh
cd mcp && npm ci && npm test
LEDGERLY_API_URL=https://api.example LEDGERLY_TOKEN=... MCP_TRANSPORT=http MCP_AUTH_TOKEN=... npm start
```

| Variable | Required | Meaning |
|---|---|---|
| `LEDGERLY_API_URL` | Yes | https, or localhost for development |
| `LEDGERLY_TOKEN` | Yes | The agent's API credential. Stays in this process |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http` |
| `MCP_HTTP_HOST`, `MCP_HTTP_PORT` | No | Default `127.0.0.1:8787`, endpoint `/mcp` |
| `MCP_AUTH_TOKEN` | If host is not loopback | Bearer token the agent presents to this server |

## Connecting the agents

Key names below come from each project's docs and the PRD test plans (HA-1, OC-1). Check them against the pinned version before relying on them.

Hermes (`~/.hermes/config.yaml`):

```yaml
mcp_servers:
  ledgerly:
    url: "http://ledgerly-mcp:8787/mcp"
    headers:
      Authorization: "Bearer <MCP_AUTH_TOKEN>"
    trust: untrusted
    tools:
      include: [ledgerly_list_groups, ledgerly_get_balances, ledgerly_create_expense, ledgerly_propose_settlement, ledgerly_get_approval]
```

OpenClaw: register the server under `mcp.servers` (streamable HTTP), then run `openclaw mcp doctor ledgerly --probe`. Whether a static bearer header is accepted or only OAuth is not confirmed.

Run one MCP container per agent, each with its own `LEDGERLY_TOKEN`, so revoking one agent does not affect the other.

## Not covered yet

- `ledgerly_settle`, the agent signer, and the check that a 402 matches the intent (FR-38). The signer will live in this server process and never be visible to the model.
- A container image and its signing.
- The API itself. Until it exists, the tests use a mock.
- Responses contain member names and descriptions written by other people. Treat them as untrusted text: they can contain instructions aimed at the agent. Policy is enforced server-side for that reason (PRD 7.4).
