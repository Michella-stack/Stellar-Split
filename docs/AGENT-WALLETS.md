# Agent wallets and `ledgerly_settle` (proposal)

Status: proposal, nothing here is built. Agent settlement is a stretch goal in `docs/BUILD-FOCUS.md` and `docs/ARCHITECTURE.md`, and stories 14 and 15 are Phase 2. How a person and their agent pay the same debt, and how a double payment is prevented, is in `docs/DELEGATED-PAYMENTS.md` and `docs/adr/`. It follows PRD section 7 and guardrails 7.4 (FR-30 to FR-38). Stellar testnet only. Anything marked **UNVERIFIED** is an assumption that must be checked before building. No signing code exists, and the API of `@x402/stellar` has not been checked here.

## Current state

Hermes and OpenClaw each own a funded testnet account with a USDC trustline. The secret keys sit in a folder on the agent host that only the host owner can read (`wallets/`, mode 700, files mode 600). That folder is **not mounted into the agent containers**. The addresses are recorded in the operator's notes, not in this repository.

## Components

```
Telegram -> agent container (Hermes | OpenClaw)
   -- MCP, internal Docker network, MCP_AUTH_TOKEN -->
ledgerly-mcp-<agent>   [holds the signer and LEDGERLY_TOKEN]
   -- HTTPS --> Ledgerly API (policy) -> facilitator -> Soroban RPC -> USDC SAC
```

One MCP container per agent, each with its own key, tokens and network. Agent containers get no key mount, no `docker.sock` and no host paths.

## Key delivery

- Mount the key into the MCP container only, as a Compose secret or a read-only bind at `/run/secrets/signer` (`LEDGERLY_SIGNER_FILE` is a proposed name).
- Read it once at start and keep it in memory. Never in an environment variable (visible with `docker inspect`), a log or a tool output.
- Run non-root, read-only filesystem, `cap_drop: ALL`, `no-new-privileges`, egress only to the API.
- **UNVERIFIED:** Compose file-secret ownership for a non-root user. Fallback: change the file's owner to that user.

## Settle flow

`ledgerly_settle {group_id, to, amount, idempotency_key}`, annotated as destructive.

1. Validate input as in the existing tools (id and amount rules, secret key rejection).
2. Ask the API for the settlement intent with a dry run (`?dry_run=true`, implemented in the API). The MCP stores the intent in its own memory, so the model never supplies payment terms. A policy denial stops the flow. Approvals and spend policy are not built in the API yet, so there is no 202 approval flow today.
3. Local checks: network is `stellar:testnet`, asset is the pinned USDC SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` (a config constant), creditor differs from the agent's own address, amount above zero.
4. Request the payment and expect `402` with `PAYMENT-REQUIRED`.
5. Compare terms. Exactly one entry must match scheme `exact`, network, asset, `payTo` equal to the intent's creditor, amount equal to the intent amount in 7-decimal units, the intent id in the resource, and the API host. Any difference aborts with nothing signed (FR-38). Field names beyond PRD section 7.1 are **UNVERIFIED**.
6. Sign only the Soroban authorization entry, at most once per intent id, and persist a "signed" marker.
7. Retry with `PAYMENT-SIGNATURE`. The API then verifies, settles through the facilitator, confirms on chain and calls `record_x402_settlement`.
8. Return the transaction hash, an explorer link and a status of `submitted` or `settled`.

## Limits

Enforced by the API (PRD 7.4): 25 USDC per transaction, 50 per rolling day, 200 per month; approval above 5 USDC, expiring after 1 hour, never answerable by the agent; more than 10 attempts in 10 minutes pauses the agent; counterparties limited to group members; float at most 50 USDC; demo amounts of 5 USDC or less. Proposal: the MCP also keeps a hard ceiling of 25 USDC. That departs from `docs/AGENT-INTERFACE.md`, which says the MCP enforces no policy, and needs a decision.

**The agent may:** read, create expenses, propose, settle within limits, poll approvals.
**The agent may not:** see the key, choose asset, network or `payTo`, pay non-members, split a payment to avoid a limit, approve its own request, or build and sign a transaction another way.

## Failure cases

An on-chain transfer is final; there is no rollback.

- Policy denial or terms mismatch: nothing signed.
- `/verify` or `/settle` fails: fresh 402, nothing recorded.
- Timeout after signing: query the status by intent id before any re-sign, and re-sign only after the authorization entry expires. This needs a status endpoint (a gap, see `docs/INCONSISTENCIES.md` item 8). A new signature carries a new nonce and could pay twice.
- Paid but not yet confirmed: status stays `submitted`, the ledger is untouched.
- Paid but recording fails (contract paused, `Overpay`): retry the record, since `DuplicateTx` makes it safe. If the balance rules reject it, post a correcting expense. The PRD is silent on this.

## Funding

Operator only; no agent-callable funding tool. Create the account and fund it with friendbot, add the USDC trustline, then send at most 50 testnet USDC. Refill by hand below 10 USDC. USDC for testnet comes from the Circle faucet, which has a captcha and cannot be scripted. **UNVERIFIED:** who pays the trustline reserve.

## Incident

1. Revoke the agent in the web app (FR-35); the API answers 401.
2. Stop the agent's MCP container.
3. Review the account's transactions on the explorer.
4. Sweep the float back to the treasury.
5. If the key may have leaked: create a new key, rotate `LEDGERLY_TOKEN` and `MCP_AUTH_TOKEN`, delete the old file.
6. The contract cannot update or remove a member address. The old member must reach net zero and the new address joins as a new member.
7. Last resort: the contract admin calls `set_paused`.

Until on-chain caps exist (Phase 2 smart accounts), a leaked key exposes only the float. The PRD's incident runbook is not written yet.

## Test plan

Functional: the PRD cases OC-1 to OC-8 and HA-1 to HA-7, plus

| ID | Case | Expected |
|---|---|---|
| SET-01 | Happy path at 5 USDC | Transaction hash returned, balance updated |
| SET-02 to 06 | `payTo`, amount (off by 1 stroop), asset, network, scheme mismatch | No signature |
| SET-07 | Several entries in `accepts` | Exactly one must match, otherwise abort |
| SET-08 | Foreign resource host | No signature |
| SET-09 | Cap exceeded | 403, no transaction |
| SET-10 | Above the approval threshold | 202, then settle after approval |
| SET-11 | Revoked credential | 401 |
| SET-12 | `/settle` fails | Fresh 402, nothing recorded |
| SET-13 | Replay of `PAYMENT-SIGNATURE` | No second transfer |
| SET-14 | Timeout after signing | No double payment |
| SET-15 | Record fails while the contract is paused | Retry succeeds after unpausing |
| KEY-01 | Look for the key in the agent's environment, `/proc` and `docker inspect` | Not found |
| KEY-02 | Agent container lists the host key folder | Not possible |
| KEY-03 | Search logs and tool output for `S` plus 55 base32 characters | None |
| KEY-04 | Key file mode | 0400 |
| INJ-01 | PRD payloads OC-6 and HA-6 | Nothing paid |

Regression: `npm test` in `mcp`, `cargo test` in `contracts`, `toolFilter` hides `ledgerly_settle` (OC-2), contract token balance is zero after the run, re-run HA-1 to HA-4 and OC-1 to OC-4 after any agent image change, and the version guard enforces 14 days on `@x402/*` and `@stellar/*`.
