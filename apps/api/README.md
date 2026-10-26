# Stellar-Split API

REST API for groups, expenses, balances and settlements. Node.js with ES modules and no runtime dependencies. The domain rules come from [`packages/shared`](../../packages/shared), so the web app and the API compute the same numbers.

## Run

```sh
cp .env.example .env            # then edit
node --env-file=.env src/main.js
npm test                        # node --test, uses an in-memory store and a fake Horizon
```

Storage is Supabase when `SUPABASE_URL` is set. Run [`database/migrations/001_ledger.sql`](../../database/migrations/001_ledger.sql) and then [`002_settlement_intents.sql`](../../database/migrations/002_settlement_intents.sql) once in the Supabase SQL editor. Both can be run again safely. SQL tests for 002 are in [`database/tests/`](../../database/tests/). Without Supabase, `ALLOW_MEMORY_STORE=true` keeps everything in memory, which is lost on restart. Production refuses it: the API does not start when `ALLOW_MEMORY_STORE=true` and `VERCEL_ENV=production`.

## Sign-in

1. `POST /v1/auth/challenge` `{ address }` returns `{ challenge, expiresAt }`, a text message valid for 5 minutes.
2. The wallet signs it with SEP-53 (Freighter `signMessage`): ed25519 over `sha256("Stellar Signed Message:\n" + challenge)`.
3. `POST /v1/auth/verify` `{ address, challenge, signature }` (signature in base64 or hex) returns `{ session: { token, address, expiresAt } }`.
4. Send `Authorization: Bearer <token>`. Sessions last 12 hours. Sessions and challenges are HMAC-signed with `SESSION_SECRET`, so the API keeps no session state and runs on serverless functions. A challenge works once: its nonce is burned in the `used_nonces` table.

Agents use a token issued by the operator. The API stores only its SHA-256 in `AGENT_TOKENS`, mapped to the agent's Stellar address. Create one with `openssl rand -base64 32`, hash it with `printf %s "$TOKEN" | sha256sum`, and give the token to that agent's MCP server.

## Deploy (Vercel)

`vercel.json` serves the web app from `dist/` and sends `/v1/*` to the function in `api/index.mjs`, so the web app and the API share one origin and need no CORS. `scripts/vercel-build.sh` builds `apps/web` when it exists. Set `SESSION_SECRET`, `USDC_ISSUER` (and optionally `EURC_ISSUER`, see below), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `APP_URL` as project environment variables (secrets as sensitive). Serverless instances do not share memory, so production needs Supabase.

## Endpoints

Shapes follow [`apps/web/src/client/README.md`](../web/src/client/README.md). Errors are `{ error: { code, message, details? } }`.

| Method and path | What it does |
|---|---|
| `GET /v1/health` | Liveness, no auth |
| `POST /v1/auth/challenge`, `POST /v1/auth/verify` | Sign-in |
| `POST /v1/agents/link/challenge`, `POST /v1/agents/link` | Delegated agent payments, session only. `{ agentAddress }` returns `{ message, nonce, expiresAt }` (valid 5 minutes, single use). The owner signs `message` with SEP-53 and sends `{ agentAddress, message, signature }`: `201 { agent: { address, ownerAddress, linkedAt } }`. `400 AGENT_NOT_REGISTERED` when the address is not in `AGENT_TOKENS`, `400 LINK_INVALID` for a bad, expired or reused signature, `409 AGENT_ALREADY_LINKED` when the agent has another active owner. Run `database/migrations/004_agent_links.sql` first |
| `GET /v1/me/agents`, `DELETE /v1/me/agents/:address` | My linked agents with `linkedAt` and `revokedAt`; revoke one (`204`) |
| `GET /v1/me`, `PATCH /v1/me` | Profile: `displayName`, `homeCurrency`, `email` |
| `GET /v1/groups`, `POST /v1/groups` | My groups with my net and totals; create a group (the creator joins) |
| `GET /v1/groups/:id` | Group, members, balances, my suggested transfers |
| `POST /v1/groups/:id/members` | Add a member by Stellar address (`kind: human` or `agent`) |
| `POST /v1/groups/:id/invites`, `POST /v1/invites/:code/accept` | Invite links, optionally bound to one address |
| `GET`, `POST /v1/groups/:id/expenses` | List; create with an equal or exact split. `Idempotency-Key` header makes retries safe |
| `GET /v1/groups/:id/balances` | Net per member, with address and kind (used by the MCP server) |
| `POST /v1/groups/:id/settlements?dry_run=true` | `{ to, amount }`: the payment terms, without reserving or recording anything (used by the MCP server) |
| `POST /v1/groups/:id/settlements/intents` | `{ to, amount, onBehalfOf? }`: step 1, reserves a settlement intent. `201 { intent }` with `id`, `payTo`, `memo: { type: 'hash', value }` and `expiresAt`. `payer` and `debtorMemberId`. `409 INTENT_IN_PROGRESS` while the payer or the creditor has another reserved intent in the group. An agent token may send `onBehalfOf` (the member id of its linked owner) to pay the owner's debt: the owner is the debtor, the agent is the payer and its spend caps count. `403 NOT_LINKED` without an active link |
| `POST /v1/groups/:id/settlements/intents/:intentId/x402` | x402-style handshake for the intent's payer. Without a `PAYMENT-SIGNATURE` header: `402` with the terms in the `PAYMENT-REQUIRED` header (base64 JSON) and in the body. With `PAYMENT-SIGNATURE` (base64 JSON `{ x402Version: 1, scheme: 'exact', network: 'stellar:testnet', payload: { txHash } }`): the same Horizon check as `POST /settlements`, then `200 { settlement }` with a `PAYMENT-RESPONSE` header. A payment that fails the check answers `402` again with `error` set |
| `POST /v1/groups/:id/settlements/intents/:intentId/cancel` | Cancels a reserved intent, for example when the signature is rejected in Freighter. Only the payer |
| `POST /v1/groups/:id/settlements` | `{ intentId, txHash }`: step 2, records the payment after Horizon confirms it. `to` and `amount` may be sent too and must match the intent |
| `POST /v1/groups/:id/receipts/scan` | `{ imageBase64, mimeType }`: reads a photo of a receipt (demo, issue #87) and returns `{ draft }`. It creates nothing. `503 SCAN_UNAVAILABLE` when there is no `GEMINI_API_KEY` or the reader is down or out of quota. Needs a session and answers `401` before reading the body. `429 RATE_LIMITED` after 10 scans in 10 minutes by the same person (counted per serverless instance) |
| `GET /v1/groups/:id/activity` | Expenses and settlements, newest first |

## Rules enforced here

- Only members see or change a group. Non-members get 404, so group ids cannot be probed.
- Amounts are decimal strings, positive, at most 7 decimals. Exact splits must add up, otherwise `422 SPLIT_MISMATCH` with the difference.
- Any request body that contains something shaped like a Stellar secret key is refused (`SECRET_KEY_REJECTED`), both before it is parsed and again on the parsed values, so JSON escapes such as `\u0053` do not get past it.
- Bodies over 64 KB get `413` with a JSON error and the connection is closed. Wrong types (an array where a string is expected) get `400 VALIDATION`.
- Stellar or the database being down, slow or overloaded (network failure, timeout, 5xx or 429 from Supabase) is `502 UPSTREAM_UNAVAILABLE`, which is safe to retry. A refused request to Supabase (other 4xx) stays `500`.
- Paying is two steps. First reserve an intent. Then build the payment with the intent's memo as a `MEMO_HASH` and time bounds that end no later than `expiresAt` (for example `setTimebounds(0, expiresAt)` instead of a longer `setTimeout`), sign it, submit it, and send `{ intentId, txHash }`.
- A settlement is recorded only when Horizon on Stellar Testnet shows a successful USDC payment from the caller's address to the creditor's address for exactly the intent's amount, carrying the intent's memo, with time bounds inside the intent. So an older payment cannot settle a new debt, and a payment cannot reach the chain after its intent expired. Each transaction hash is recorded once.
- While an intent is reserved, nobody else can settle with its payer or its creditor in that group (unique indexes in the database), and the amount is checked against the balances read after the reservation. So two concurrent payments cannot overpay. Intents expire after 10 minutes.
- If the payment arrives but no longer matches an open debt (the intent was cancelled, or an expense changed the debt meanwhile), the API answers `409 NEEDS_REVIEW` and keeps the intent as `needs_review` with its transaction hash, instead of recording it or losing it.
- Agents are capped on the server (PRD 7.4, issue #13). An agent cannot reserve a settlement intent, or get payment terms from `?dry_run=true`, that would take it over 25 USDC per payment, 50 USDC in 24 hours or 200 USDC in 30 days, counted over all its groups. The API answers `403` with `AGENT_CAP_PER_PAYMENT`, `AGENT_CAP_PER_DAY` or `AGENT_CAP_PER_MONTH` and `details: { limit, spent, window }`, and logs `agent_spend_denied` with the agent, group, amount and rule. A reservation that is refused is cancelled at once, so no payment can follow it. The rule is in [`packages/policy-engine`](../../packages/policy-engine). An agent can only pay members of groups it belongs to. Humans are not capped. The caps are plain numbers in the group's own asset and are summed across all of the agent's groups without converting, so a EURC amount counts like the same number of USDC (ADR 0010).
- The receipt scan (demo, issue #87) sends one photo to Gemini (`RECEIPT_MODEL`, default `gemini-3.6-flash`) through `fetch`, with the key in `GEMINI_API_KEY`, and returns a draft. The photo must be a JPEG, PNG or WebP of at most 1.4 million base64 characters (this route alone accepts a body that large; every other route stops at 64 KB) whose first bytes match its type. The request asks Google not to store it (`store: false`). If the main model does not answer in 7 seconds or answers with an error, `RECEIPT_FALLBACK_MODEL` (default `gemini-3.5-flash-lite`) gets one try of up to 4 seconds; an unreadable answer is not retried. The newer `gemini-3.8-flash` is not the default because on the free tier it answered 503 "high demand" and sometimes did not answer at all. The reply is checked like any expense input: the total must be a positive amount with at most 7 decimals, text is cut and cleaned, a Stellar secret key anywhere in it is refused, and anything that is not a receipt answers `422 NOT_A_RECEIPT`. A ticket in USD counts 1:1 as USDC, and for any other currency `usdc` is `null`: no exchange rate is guessed. The photo and the reading are never stored or logged, only the size, the time and the warnings. On Google's free tier Google may use what it receives to improve its products, so use sample receipts only.
- Testnet only: the API refuses to start with another network and checks the Horizon network passphrase before the first verification.

Not built: approvals (there is no `/v1/approvals` route), agent policies and the x402 settle flow (issues #11 to #13, #19).

## Known limits

- A reserved intent blocks other settlements for its payer and its creditor in that group until it is paid, cancelled or expires (10 minutes). That is what makes concurrent payments safe, but it also means each person takes part in one payment at a time per group.
- Intents in `needs_review` have no route yet: an operator resolves them in the database. A reconciliation job for them is not built.
- The receipt scan has no rate limit of its own. Anyone who can sign in can call it until the free quota runs out, and then it answers `503 SCAN_UNAVAILABLE`.
- The web app must reserve an intent first and add its memo to the payment (follow-up in #55). Its current `setTimeout` already ends inside the intent when the payment is built right after the reservation. Until then, its payments are refused.

## Settlement asset per group (#98)

A group settles in one asset: `USDC` (the default) or `EURC`. `POST /v1/groups` takes an optional `asset`. The group, its settlement intents and its payment check all use that asset, and a payment in another asset is refused with `PAYMENT_MISMATCH`. EURC is offered only when `EURC_ISSUER` is set to Circle's Testnet EURC issuer (`GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO`, from Circle's EURC address list), and `database/migrations/003_group_asset.sql` has been run. Without the issuer, asking for `EURC` answers `400 ASSET_NOT_SUPPORTED`. Agent spend caps are still plain numbers, so for a EURC group they mean EURC.

## Delegated agent payments (x402-style, self-verified)

An owner links an agent once with a signed message. The agent can then reserve an intent for the owner's debt and pay it from its own account. This is x402-style and self-verified: the API answers HTTP 402 with the payment terms, the agent sends a classic Stellar payment with the intent memo, and the API checks it on Horizon with the same verifier as `POST /settlements`. There is no external facilitator, no Soroban authorization entry, no `@x402/*` package, and the contract's `record_x402_settlement` is not called. Those are roadmap.
