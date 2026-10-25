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
| 8 | `?dry_run=true` on the settlements endpoint is used by `mcp/src/api.js` but is not in the PRD or the stories. There is no endpoint to query a settlement by intent id, which the safe-retry flow needs | Agree the API shape; add a status endpoint |
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
