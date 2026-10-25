# Documentation inconsistencies

Review of 2026-10-25 on `main` plus the open PRs #28 to #32. Items marked **checked** were confirmed against the files by the maintainer's assistant. The others come from a review agent and have not been independently verified; its line numbers are approximate, so confirm before editing. Each item gives the conflict and a suggested fix.

## High

| # | Conflict | Fix |
|---|---|---|
| 1 | **Which phase holds the agent signer and `ledgerly_settle`.** The PRD MVP text and story 14 ("MCP server with local signer") and story 15 ("Hermes Agent integration") are Phase 1a, must. `docs/BUILD-FOCUS.md` and `README.md` call agent x402 a "stretch" and defer the Hermes plan. **Checked** for the stories and the MVP wording. `docs/AGENT-INTERFACE.md` said Phase 2 and was corrected in this branch | Pick one phase. Align BUILD-FOCUS and README to the stories, or demote the stories |
| 2 | **Where `LEDGERLY_TOKEN` lives.** PRD test plan HA-1 and story 15 put it in `~/.hermes/.env`. `docs/AGENT-INTERFACE.md` keeps it only in the MCP process, with the agent holding `MCP_AUTH_TOKEN` | Change HA-1 and story 15 to `MCP_AUTH_TOKEN` |
| 3 | **OpenClaw phase.** Story 18 is `phase:2`, `priority:should` on `main`, while the PRD makes Hermes and OpenClaw both Phase 1a (PR #28 moves it) **Checked** | Merge PR #28 |
| 4 | **Dependabot misses the MCP package.** `.github/dependabot.yml` has npm for `directory: "/"`, but the only `package.json` is `mcp/package.json`. The Docker ecosystem the PRD asks for is also absent **Checked** | Set `directory: "/mcp"`, add Docker |

## Medium

| # | Conflict | Fix |
|---|---|---|
| 5 | Contract status: BUILD-FOCUS and README say "contract if time remains"; `contracts/README.md` shows it deployed and the stories make it must | Update BUILD-FOCUS and README |
| 6 | Claims false today: BUILD-FOCUS says `.env.example` is present (it is not on `main`) **checked**; it cites `docs/LITERATURE.md` (missing) **checked**; the PRD says trust assumptions are in `SECURITY.md`, and lists `.nvmrc`, `PRIVACY.md`, `CONTRIBUTING.md` (none exist), "all section 10 workflows" (about half exist), a fuzz run and an upgrade function (neither exists); README describes a wallet network check but there is no app yet | Remove or create each item |
| 7 | `approved-versions.yaml` in the PRD versus `approved-versions.json` in the repo. The list is empty, and the PRD says CI fails on unlisted versions while the guard only fails versions older than approved | Rename in the PRD, seed the MCP dependencies, state the real rule |
| 8 | `?dry_run=true` on the settlements endpoint is not in the PRD or the stories. The API now implements it and the MCP server uses it. There is still no endpoint to query a settlement by intent id, which the safe-retry flow needs | Describe `dry_run` in the PRD; add a status endpoint |
| 8b | The PRD tool table (7.2) lists `ledgerly_get_approval`, but the API has no approvals route and the MCP server does not expose the tool. Before this fix the tool existed and always answered 404, and the MCP server also used field names the API did not accept (`payer`, `rule`, `member` instead of `paidBy`, `type`, `memberId`) | Fixed in the MCP server. Add the tool back when approvals exist |
| 9 | PRD says `record_x402_settlement` takes an intent id and tx hash; the contract takes `(group, from, to, amount, tx_hash)` with no intent id | Align PRD to the contract or the reverse |
| 10 | Indexer: the PRD puts it in Phase 1 or the MVP in some places and Phase 2 in others; story 21 says Phase 2 | Pick one |
| 11 | PRD version: README and BUILD-FOCUS said v0.2 while the PRD says v0.3 (aligned on `main` by PR #33) | Check that no other document still says v0.2 |
| 12 | Owner tables blank in BUILD-FOCUS; the PRD says "single maintainer" and a different GitHub owner than the repository's | Fill in or remove |
| 13 | `docs/AGENTS.md` (PR #30): says agents are "reachable only on Telegram" and also describes dashboards through a Cloudflare tunnel; the PRD says Tailscale. It says agents hold no Stellar keys, but each agent now owns a funded testnet account (the key location is in `docs/AGENT-WALLETS.md`). Image tags `:latest` and `:stable` versus digest pins the PRD asks for (digest pinning has since been applied on the server). The PRD assumes a different model host | Update AGENTS.md after merging |

## Low

| # | Conflict | Fix |
|---|---|---|
| 14 | Name: "Ledgerly" (PRD, contract README, `ledgerly_*` tools) versus "Stellar-Split" (README, crate `stellar_split_group`) | Say in README that Ledgerly is the working name |
| 15 | PRD example settles 25.00 USDC, which exceeds the 5 USDC approval threshold and would return 202. HA-4 says "at or below" the threshold, story 15 says "below" | Use an amount under the threshold; fix the wording |
| 16 | Group size: PRD says 2 to 20 members; the contract and the MCP schema allow 50 | Align |
| 17 | Tool list: story 15 names 4 tools, the PRD names 6; MVP wording says "propose and settle" in one place and "settle" in another | Align |
| 18 | Facilitator: PRD names Coinbase or OpenZeppelin; BUILD-FOCUS, JUDGING and story 12 say OpenZeppelin only; x402.org is named nowhere | Align |
| 19 | Contract README example uses native XLM for group 1, everything else says USDC. The 200 USDC monthly cap is in no story | Align |

## No drift found

`soroban-sdk` 28.0.0, `stellar-cli` 28.1.0 and Rust 1.97.0 agree across `contracts/README.md`, `Cargo.toml`, `contracts.yml` and `rust-toolchain.toml`. Error codes 1 to 15 match `lib.rs`.

## Update after the architecture documentation

Checked against `main` after `docs/ARCHITECTURE.md`, the repository skeleton and the new story priorities landed.

### Resolved since the first review

| Item above | What changed |
|---|---|
| 1 and 3 (which phase holds the signer and `ledgerly_settle`) | BUILD-FOCUS, ARCHITECTURE and the PRD roadmap now call agent x402 settlement a stretch goal, and stories 11 to 13 are "could", 14, 15 and 19 to 21 Phase 2 |
| 3 (OpenClaw phase) | PR #28 was merged. See the new item N1 for what it left |
| 6 (`.env.example`) | The file now exists at the repository root |
| 6 (`docs/LITERATURE.md`) | No document other than this review refers to it any more |
| 7 (approved versions) | The list is no longer empty: PR #38 approved the web dependencies |

### New or still open

| # | Conflict | Fix |
|---|---|---|
| N1 | Story 18 (OpenClaw integration) is Phase 1a and "must" while story 15 (Hermes integration) is Phase 2 and "should". ARCHITECTURE treats both agents alike | Give both the same phase and priority |
| N2 | The real MCP server is `mcp/`. The repository skeleton also has `mcp-server/`, which ARCHITECTURE section 12 declares old scaffolding. The PRD and several stories still say "MCP server" without a path | Delete the empty `mcp-server/` or say in its README that `mcp/` is the implementation |
| N3 | ARCHITECTURE section 4.8 and `docs/AGENTS.md` said no agent holds a Stellar key. Each agent now has a funded Testnet account | Fixed in the pull request that adds the delegated payment design: they now say no container can reach a key |
| N4 | ARCHITECTURE lists the Testnet USDC identity as "to confirm". The accounts created for the agents use Circle's testnet USDC, classic issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` and Stellar Asset Contract `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`. These values come from the Stellar developer skill and from `@x402/stellar`'s exported constants, and have not been confirmed by the team | Fixed: confirmed on Testnet (the contract id is derived from the asset and the contract answers `name` = `USDC:GBBD47…`) and recorded in ARCHITECTURE section 9, the README and the root `.env.example` |
| N5 | The deployed contract's group 1 uses native XLM. The settlement demo needs a group whose token is the Testnet USDC contract | Create a USDC group before wiring `settle` |
| N6 | The PRD says the verifier checks that the payer is the debtor. The delegated payment design lets an agent linked to the debtor be the payer | Decide in review of ADR 0004, then align the PRD |
| N7 | `database/migrations/` exists but ARCHITECTURE says `database/` is future scaffolding, and no migration location is chosen | Decide where the SQL goes (see `docs/schema/README.md`) |
| N8 | `.github/dependabot.yml` still has npm for `/` while the only `package.json` is in `mcp/`, and `apps/web` will add another | Add entries per directory |

## Status for issue #47 (25 October 2026)

Every item above is either fixed or explicitly deferred. "Fixed here" means the pull request that closes #47.

| # | Status | Where |
|---|---|---|
| 1 | Fixed earlier | Agent x402 is a stretch goal in BUILD-FOCUS, ARCHITECTURE, the PRD roadmap and the stories |
| 2 | Fixed here | PRD HA-1 now says Hermes holds only `MCP_AUTH_TOKEN` and the API credential stays in the MCP server, matching story 14 |
| 3, N1 | Fixed earlier | Hermes (story 14) and OpenClaw (story 17) are both Phase 1a and "must", and so are issues #15 and #18 |
| 4, N8 | Fixed earlier, completed here | #58 set Dependabot npm entries per package. This PR adds `/scripts/demo-accounts` |
| 5 | Fixed earlier | BUILD-FOCUS and README describe the deployed contract and the plain-payment-first decision |
| 6 | Partly fixed here, rest deferred | `.env.example` exists, `docs/LITERATURE.md` is no longer cited, the README's wallet network check is now real, and `apps/web/.nvmrc` exists. `SECURITY.md` now has the trust assumptions the PRD points to. **Deferred:** `PRIVACY.md` and `CONTRIBUTING.md` (Phase 0 and MVP exit criteria), the fuzz target and the contract upgrade function (PRD 9.2 targets, post-hackathon), and the section 10 workflows that do not exist yet (Scorecard, Trivy, Release) |
| 7 | Fixed here | The PRD names `approved-versions.json` (since #33) and now states the guard's real rule. A dependency missing from the list is not a failure |
| 8 | Fixed here, one part deferred | PRD FR-22 now describes the two-step settlement (intent with memo, then the payment) and `?dry_run=true`. **Deferred:** an endpoint to read a settlement by intent id, for safe retries |
| 8b | Fixed earlier | The MCP server dropped `ledgerly_get_approval` (#57). PRD 7.2 now says which tools are built |
| 9 | Fixed here | PRD 7.1 step 10 uses the deployed contract's `record_x402_settlement(group, from, to, amount, tx_hash)` |
| 10 | Deferred to the PRD owner | The indexer is post-hackathon in every document: the PRD "Phase 1: MVP" comes after the Phase 1a hackathon build, and story 21 says Phase 2. Pick one of the two labels when the roadmap is next reviewed |
| 11 | Fixed earlier | No document says v0.2 any more |
| 12 | Fixed here | The BUILD-FOCUS owner table is filled in. The PRD "Owner" is the product owner (Victor), while the repository belongs to Michella's account. Both are correct |
| 13 | Fixed earlier | `docs/AGENTS.md`: administration over Tailscale, dashboards through a Cloudflare tunnel behind Authentik, images pinned by digest, and no keys in the containers |
| 14 | Fixed earlier | The README says the PRD was written under the working name Ledgerly |
| 15 | Fixed here | The PRD 7.1 example now settles 4.50 USDC, under the 5 USDC approval threshold |
| 16 | Fixed here | PRD G1 keeps 2 to 20 as the target size and says the contract and API accept up to 50 |
| 17 | Fixed here | PRD 7.2 lists the four tools built today. `ledgerly_settle` and `ledgerly_get_approval` come later, matching story 14 |
| 18 | Fixed here | The PRD names the OpenZeppelin facilitator first and Coinbase's as the fallback, like BUILD-FOCUS, JUDGING and story 11 |
| 19 | Partly fixed, rest deferred | Group 1 is documented as an XLM smoke test (README and `contracts/README.md`). **Deferred:** the 200 USDC monthly cap has no story; add it to issue #13 (agent spend policy) if kept |
| N2 | Fixed here | The empty `mcp-server/` placeholder is removed. ARCHITECTURE says the MCP server is `mcp/` |
| N3 | Fixed earlier | ARCHITECTURE and AGENTS say that no container can reach a key |
| N4 | Fixed earlier | ARCHITECTURE section 9 records the confirmed Circle Testnet USDC: issuer `GBBD47…LFLA5` and SAC `CBIELTK6…DAMA`. Re-checked: the SDK derives the same contract id from the asset, and stellar.expert lists it as `USDC-GBBD47…` |
| N5 | Deferred | A USDC group on the contract is only needed when the web app switches to `settle`. That work is issue #88; issue #46 tracks the redeploy |
| N6 | Deferred | ADR 0004 is accepted as the stretch path. Align the PRD's "payer is the debtor" rule when agent payments are built |
| N7 | Fixed here | ARCHITECTURE says `database/migrations/` holds the Supabase SQL (`001`, `002`) and `database/tests/` its tests |
| New | Fixed here | Two ADRs were numbered 0001. The web SPA record is renumbered to 0007 and added to the ADR index |
