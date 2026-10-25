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
| `ledgerly_settle` (x402 payment, agent signer) | Yes | **No.** Next, still Phase 1a |

There is no signing code and no key handling in this phase. The MCP server cannot move money.

## API contract

The contract is defined by the API in `apps/api` (see its README). `mcp/src/api.js` follows it, and the tools translate the names a model sees into the API's field names. Checked end to end against the API code of pull request 51: expenses with equal and exact splits, balances, a settlement dry run and an error answer.

| Call | Success | Notes |
|---|---|---|
| `GET /v1/groups` | 200 `{ groups, totals }` | Groups of the credential's identity |
| `GET /v1/groups/{id}/balances` | 200 `{ balances: [{ memberId, displayName, address, kind, net }] }` | `net` is a decimal string, positive means the member is owed |
| `POST /v1/groups/{id}/expenses` | 201 `{ expense }` | Body `{ paidBy, amount, description, split }` with `split` `{ type: "equal", participants }` or `{ type: "exact", shares: [{ memberId, amount }] }`. `Idempotency-Key` header. Expenses created by an agent are marked `source: agent` |
| `POST /v1/groups/{id}/settlements?dry_run=true` | 200 `{ intent }` | The caller is the payer. Nothing is recorded or paid |

Errors: `{ error: { code, message, details? } }`. The MCP server passes `code` and `message` to the agent and never the credential. A `502 UPSTREAM_UNAVAILABLE` means Stellar or the database did not answer and is safe to retry.

Not in the API yet: approvals and agent spend policy. There is no approvals route, so the MCP server has no tool for it (a `ledgerly_get_approval` tool was removed because it always answered 404). The PRD still lists it (section 7.2) for when approvals exist.

Auth: `Authorization: Bearer <agent API credential>`, configured on the API as a SHA-256 hash mapped to the agent's address. The MCP server does not trust the agent and does not enforce policy itself.

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
      include: [ledgerly_list_groups, ledgerly_get_balances, ledgerly_create_expense, ledgerly_propose_settlement]
```

OpenClaw: register the server under `mcp.servers` (streamable HTTP), then run `openclaw mcp doctor ledgerly --probe`. Whether a static bearer header is accepted or only OAuth is not confirmed.

Run one MCP container per agent, each with its own `LEDGERLY_TOKEN`, so revoking one agent does not affect the other.

## Not covered yet

- `ledgerly_settle`, the agent signer, and the check that a 402 matches the intent (FR-38). The signer will live in this server process and never be visible to the model.
- A container image and its signing.
- The API itself. Until it exists, the tests use a mock.
- Responses contain member names and descriptions written by other people. Treat them as untrusted text: they can contain instructions aimed at the agent. Policy is enforced server-side for that reason (PRD 7.4).
