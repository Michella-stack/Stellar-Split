# Testing status and gaps

Audit of 2026-10-25 on branch `feat/agent-mcp` (main at `ccebd35` plus the MCP server). Three review agents read the code and ran the suites; the MCP result below was also run by the maintainer's assistant. Nothing here was run on GitHub Actions.

## How to run everything

```sh
cd mcp && npm ci && npm test                         # MCP server
node --test "supply-chain/*.test.js"                 # version guard
bash supply-chain/check-actions-pinned.sh .github    # every `uses:` pinned by SHA
cd contracts && cargo test
cd contracts && cargo clippy --all-targets -- -D warnings
cd contracts && cargo fmt --check
```

## Results today

| Suite | Result |
|---|---|
| `mcp` tests | 14 of 14 pass (Node 25; CI targets Node 22, not run there) |
| `supply-chain` tests | 53 pass, 2 `todo` (known guard bugs, see below) |
| Pinned actions check | Pass. Independent grep agrees |
| Contract `cargo test` | 15 of 15 pass |
| Contract `cargo clippy -D warnings` | Clean |
| Contract `cargo fmt --check` | **Fails**: 7 diffs (`lib.rs` 169, 192, 206, 214; `test.rs` 87, 97, 180). CI never runs fmt, so it stays green |
| Not run | `stellar contract build`, `cargo scout-audit` (tools missing), the deploy script, Node 22, any remote workflow |
| CI `review` (dependency review) | Fails on every PR because the repository's Dependency graph is off. A repo setting, not code |

## Functional versus regression coverage

Functional means each public behaviour works as specified. Regression means a named rule has a test that fails if someone breaks it. The contract result comes from a mutation check by the audit agent in a scratch copy and has not been reproduced independently.

### Contract (`contracts/group`)

Functional coverage is good. Regression coverage has holes: three deliberate code changes passed all 15 tests.

| Gap | Evidence |
|---|---|
| Creditor side of `Overpay` (`amount > net(to)`) untested | Changing `debt.min(to_net)` to `debt` at `lib.rs:169` still passes 15/15 |
| `add_expense` with more than 50 deltas (`TooManyMembers`) untested | Deleting the branch at `lib.rs:250` still passes |
| TTL extension untested | Deleting `extend_ttl` at `lib.rs:107` still passes |
| No test reads `env.events()`; none of the 5 events (plus `member_added` from `create_group`) is checked | |
| `record_x402_settlement`: `SameAddress`, `InvalidAmount`, `DebtorNotNegative`, `CreditorNotPositive`, `NotMember`, `GroupNotFound` untested | Only duplicate hash and recorder auth are tested |
| `Overflow` tested on one path only | Missing: `i128::MIN` negation, balance plus delta, `NextGroup` |
| `GroupNotFound` untested for `add_member`, `add_expense`, `record_x402`, `balance`, `group_token` | |
| Auth tests mostly assert `is_err()`, not which error | `test.rs:211, 288, 373` |
| No `create_group` auth test; `add_member` and `create_group` while paused not tested | |
| Scope of duplicate checks across groups unpinned | `expense_hash` is per group, x402 `tx_hash` is global |
| Randomised invariant test uses 3 members, 200 steps, no proptest | |

README versus code: `expense_hash` scope and the 50-entry delta limit are undocumented; `create_group` also emits `member_added`; `settle` updates balances before the transfer, README says the reverse (same outcome). Error codes 1 to 15 and the 50-member cap match.

### MCP server (`mcp/`)

Tested: tool list and annotations, credential attached and never returned, idempotency key, amount and id validation, exact-split mismatch, secret key in every id and text field (added after the audit found it was only checked in `description`), policy errors, dry run, approvals, network error, HTTP 401 and loopback guard, startup validation (`main.js`).

Added afterwards in `mcp/test/gaps.test.js`: stdio transport (initialize, tools/list, exit when stdin closes); HTTP 404, 405, invalid JSON, empty and oversized body, and the order of those checks; API timeout, non-JSON and empty error bodies, truncation of long errors, both error shapes; untrusted API text passed through to the model as data; schema bounds (50 participants, description length, idempotency key length); duplicate participants and a payer missing from the split (both accepted today, pinned by a test).

Still open: the API client does not redact the credential if the API itself echoes it in an error message (`test.todo`).

### Version guard (`supply-chain/version-guard.js`)

Covered: exact version, pre-release, deprecated, yanked, version not found, cooldown of 7 days and of 14 days for every sensitive family (`@x402/*`, `@stellar/*`, `soroban-sdk`, `stellar-*`, `*crypto*`, `*sodium*`, `*noble*`) including the exact boundary, newer stable past cooldown, older than approved (policy tested with an `approved-versions.json`-shaped object), OSV critical, high, medium, low and no-severity, fail-closed on registry or OSV errors and timeouts, Cargo ranges, `file:`, `link:` and `workspace:` skips, `compareVersions`, `renderReport`, and `main()` through the CLI against a temporary git repository.

Known gaps, kept as `todo` tests: a registry release with no publish time passes the cooldown (fail-open), and numeric pre-release identifiers compare lexically (`rc.10` before `rc.2`). The guard checks direct dependencies only.

### CI

| Item | Gap |
|---|---|
| `mcp/` tests | **No workflow runs them** |
| `cargo fmt --check` | Not run |
| Shell scripts (`scripts/`, `supply-chain/*.sh`) | No `bash -n` or shellcheck job |
| `CODEOWNERS` | Does not cover `/mcp/` or `/scripts/` |
| Dependabot | npm entry points at `/`, but the only `package.json` is in `mcp/`, so MCP dependencies get no update PRs |
| Version guard | Skips a PR entirely if the guard is missing on the base branch |
| `scripts/deploy-testnet.sh` | Swallows funding failures (`|| true`), hard-coded wasm path, no mainnet guard, recorder defaults to the admin, no check that `stellar` is installed |

### Delegated payment schema (`docs/schema/`)

Proposal only, not applied to any database. `docs/schema/delegated-payments.test.sql` has 21 checks that a statement must be refused and 4 result checks, run in a throwaway PostgreSQL 15 with a stub of Supabase's `auth` schema, and all passed on 2026-10-25. A manual race with 30 parallel connections for the same debt gave 1 success and 29 failures on `one_open_intent_per_debt`. Not covered: the real Supabase environment and anything that needs the API. The remaining cases (DP-10 to DP-16, LK, RK) are listed in `docs/DELEGATED-PAYMENTS.md` section 8.

## Priority list of missing tests and jobs

1. CI job: `npm ci && npm test` in `mcp/` on Node 22 for PRs touching `mcp/**`.
2. Contract: `settle_overpay_creditor_side`, `expense_too_many_deltas`, `ttl_extended_on_write` (each kills a surviving mutant).
3. Contract: `x402_rejection_matrix` for `record_x402_settlement`.
4. Contract: `events_emitted_with_exact_topics_and_data`.
5. Contract: overflow cases at `i128` limits, and `failed_call_leaves_state_unchanged`.
6. Run `cargo fmt` once and add `cargo fmt --check` to `contracts.yml`.
7. Version guard: make a missing registry publish time fail closed (the `todo` test shows the bug).
8. MCP: HTTP edge cases, API timeout and non-JSON bodies, schema bounds.
9. Add `/mcp/` and `/scripts/` to `CODEOWNERS`; point Dependabot npm at `/mcp`.
10. Shellcheck job; harden `deploy-testnet.sh`.
11. Phase 1a settle flow: the SET, KEY and INJ cases listed in `docs/AGENT-WALLETS.md`.
12. Enable the Dependency graph so the `review` check can pass.

## Not verified

GitHub Actions behaviour, Node 22, `stellar contract build` and `scout-audit`, the deploy script, the real Ledgerly API (it does not exist yet), and any end-to-end run with Hermes or OpenClaw.
