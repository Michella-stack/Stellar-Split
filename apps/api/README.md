# Stellar-Split API

REST API for groups, expenses, balances and settlements. Node.js with ES modules and no runtime dependencies. The domain rules come from [`packages/shared`](../../packages/shared), so the web app and the API compute the same numbers.

## Run

```sh
cp .env.example .env            # then edit
node --env-file=.env src/main.js
npm test                        # node --test, uses an in-memory store and a fake Horizon
```

Storage is Supabase when `SUPABASE_URL` is set. Run [`database/migrations/001_ledger.sql`](../../database/migrations/001_ledger.sql) once in the Supabase SQL editor. Without Supabase, `ALLOW_MEMORY_STORE=true` keeps everything in memory, which is lost on restart.

## Sign-in

1. `POST /v1/auth/challenge` `{ address }` returns `{ challenge, expiresAt }`, a text message valid for 5 minutes.
2. The wallet signs it with SEP-53 (Freighter `signMessage`): ed25519 over `sha256("Stellar Signed Message:\n" + challenge)`.
3. `POST /v1/auth/verify` `{ address, challenge, signature }` (signature in base64 or hex) returns `{ session: { token, address, expiresAt } }`.
4. Send `Authorization: Bearer <token>`. Sessions last 12 hours. Sessions and challenges are HMAC-signed with `SESSION_SECRET`, so the API keeps no session state and runs on serverless functions. A challenge works once: its nonce is burned in the `used_nonces` table.

Agents use a token issued by the operator. The API stores only its SHA-256 in `AGENT_TOKENS`, mapped to the agent's Stellar address. Create one with `openssl rand -base64 32`, hash it with `printf %s "$TOKEN" | sha256sum`, and give the token to that agent's MCP server.

## Deploy (Vercel)

`vercel.json` serves the web app from `dist/` and sends `/v1/*` to the function in `api/index.mjs`, so the web app and the API share one origin and need no CORS. `scripts/vercel-build.sh` builds `apps/web` when it exists. Set `SESSION_SECRET`, `USDC_ISSUER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `APP_URL` as project environment variables (secrets as sensitive). Serverless instances do not share memory, so production needs Supabase.

## Endpoints

Shapes follow [`apps/web/src/client/README.md`](../web/src/client/README.md). Errors are `{ error: { code, message, details? } }`.

| Method and path | What it does |
|---|---|
| `GET /v1/health` | Liveness, no auth |
| `POST /v1/auth/challenge`, `POST /v1/auth/verify` | Sign-in |
| `GET /v1/me`, `PATCH /v1/me` | Profile: `displayName`, `homeCurrency`, `email` |
| `GET /v1/groups`, `POST /v1/groups` | My groups with my net and totals; create a group (the creator joins) |
| `GET /v1/groups/:id` | Group, members, balances, my suggested transfers |
| `POST /v1/groups/:id/members` | Add a member by Stellar address (`kind: human` or `agent`) |
| `POST /v1/groups/:id/invites`, `POST /v1/invites/:code/accept` | Invite links, optionally bound to one address |
| `GET`, `POST /v1/groups/:id/expenses` | List; create with an equal or exact split. `Idempotency-Key` header makes retries safe |
| `GET /v1/groups/:id/balances` | Net per member, with address and kind (used by the MCP server) |
| `POST /v1/groups/:id/settlements` | `{ to, amount, txHash }`: records a payment after Horizon confirms it. `?dry_run=true` returns the payment intent without recording |
| `GET /v1/groups/:id/activity` | Expenses and settlements, newest first |

## Rules enforced here

- Only members see or change a group. Non-members get 404, so group ids cannot be probed.
- Amounts are decimal strings, positive, at most 7 decimals. Exact splits must add up, otherwise `422 SPLIT_MISMATCH` with the difference.
- Any request body that contains something shaped like a Stellar secret key is refused (`SECRET_KEY_REJECTED`), both before it is parsed and again on the parsed values, so JSON escapes such as `\u0053` do not get past it.
- Bodies over 64 KB get `413` with a JSON error and the connection is closed. Wrong types (an array where a string is expected) get `400 VALIDATION`.
- Stellar or the database being down, slow or overloaded (network failure, timeout, 5xx or 429 from Supabase) is `502 UPSTREAM_UNAVAILABLE`, which is safe to retry. A refused request to Supabase (other 4xx) stays `500`.
- A settlement is recorded only when Horizon on Stellar Testnet shows a successful USDC payment from the caller's address to the creditor's address for exactly that amount. The amount cannot exceed what the payer owes or what the creditor is owed. Each transaction hash is recorded once.
- A payment older than 30 minutes, or from before the group existed, cannot settle a debt (`422 PAYMENT_TOO_OLD`), so an old payment made outside the app cannot be replayed against a new debt. The debt is read again, and the settlement recorded, inside a per-group queue, so two requests for the same debt cannot both pass the overpay check.
- Testnet only: the API refuses to start with another network and checks the Horizon network passphrase before the first verification.

Not built: approvals (there is no `/v1/approvals` route), agent policies and the x402 settle flow (issues #11 to #13, #19).

## Known limits

- The per-group queue lives in one process. With several serverless instances, two requests on different instances can still race. A database-side check is needed for that (see `docs/adr/0003-one-open-settlement-intent-per-debt.md`).
- The age limit is a quick fix. The stronger one is to tie each payment to its settlement intent, for example through the transaction memo, so that a payment can only settle the debt it was made for.
