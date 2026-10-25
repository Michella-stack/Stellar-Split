# Deployment (Vercel)

The web app and the API are deployed as one Vercel project. Stellar Testnet only.

## Live URL

| What | URL |
|---|---|
| Web app | https://stellar-split-sooty.vercel.app |
| API health | https://stellar-split-sooty.vercel.app/v1/health (answers `{"status":"ok","network":"testnet"}`) |

The project is `stellar-split` in the Vercel team `vestival's projects`. Deployment protection is off, so the URL is public, which the judges need. Preview deployments are public too.

## Status on 25 October 2026

| Item | State |
|---|---|
| Vercel project and public URL | Working. The health endpoint answered 200 |
| Content served | The **placeholder page**. The two deployments so far were made by hand and predate the web app, so they carry no commit information |
| Automatic deploys from GitHub | **Not connected yet.** See the next section |

## What is deployed

`vercel.json` at the repository root defines one project:

- `scripts/vercel-build.sh` builds `apps/web` (Vite) into `dist/`, which Vercel serves. It falls back to a placeholder page when `apps/web` does not exist.
- Every `/v1/*` request is rewritten to the function `api/index.mjs`, which runs the API from `apps/api` (15 second limit). The web app and the API share one origin, so no CORS is needed.
- Security headers are set on every response.
- The web production build reads `apps/web/.env.production`, which is committed and holds only public Testnet values.

## Goal: every commit deploys by itself

| Push to | Result |
|---|---|
| `main` | A production deployment at the URL above |
| Any other branch, and every pull request | A preview deployment with its own URL |

Nobody should run a deploy command by hand.

## Why it is not automatic yet

Vercel deploys from GitHub through the **Vercel GitHub App**. The repository belongs to the personal GitHub account `Michella-stack`. The Vercel account that owns the project can only see the GitHub namespaces `vestival` and one team, not `Michella-stack`, and no Vercel project is linked to this repository. Installing a GitHub App on a personal account can only be done by that account's owner.

## How to connect it

**Option A, recommended (one person, a few minutes).**

1. The owner of `Michella-stack` opens https://github.com/apps/vercel, chooses *Configure* and installs the app on the account with access to **only** the repository `Stellar-Split`.
2. In Vercel, project `stellar-split`, *Settings*, *Git*: connect `Michella-stack/Stellar-Split`.
3. Production branch `main`. Leave the framework preset empty, because `vercel.json` already sets the build. The root directory is the repository root.
4. Check *Settings*, *Environment Variables* against the list below.
5. Push any commit. A deployment appears in Vercel with the commit on it.

**Option B, if the app cannot be installed on that account.** A GitHub Actions workflow that runs the Vercel CLI on every push, using three repository secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). Only an administrator of the repository can add secrets, so this also needs Michella. Pull requests from forks never receive secrets. It would be a new workflow and needs code owner review. Not written yet.

## Environment variables (Vercel project settings)

Names only. Never commit values and never put a secret in a variable that starts with `VITE_`, because those end up in the browser.

| Variable | Used by | Notes |
|---|---|---|
| `SESSION_SECRET` | API | At least 32 characters. Sensitive |
| `USDC_ISSUER` | API | The Testnet USDC issuer |
| `SUPABASE_URL` | API | The Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | API | Server only. Sensitive. It bypasses row level security |
| `APP_URL` | API | The public URL above, used for invite links |
| `AGENT_TOKENS` | API | Optional. SHA-256 hashes of agent tokens mapped to their addresses. See `apps/api/README.md` |

Production needs Supabase: serverless instances do not share memory, so the in-memory store (`ALLOW_MEMORY_STORE`) must not be used there. The names and meaning come from `apps/api/README.md` and `apps/api/.env.example`. Whether each variable is set in the project has not been checked.

## After a deployment

1. Open the URL and check that the web app loads, not the placeholder.
2. `curl https://stellar-split-sooty.vercel.app/v1/health` returns `{"status":"ok","network":"testnet"}`.
3. Connect Freighter on Testnet and sign in.

## Roll back

In Vercel, *Deployments*, pick a previous good deployment and promote it. Or revert the commit on `main`, which deploys the revert.

## Limits

- The per-group queue that stops two settlements for the same debt lives in one function instance. See `apps/api/README.md`, "Known limits".
- The function has a 15 second limit, so listing many groups must stay fast.
- Whether the free Vercel plan allows other people to be added to the team has not been checked. Anyone who needs to see deployments or logs needs access to the team.

## Not verified

That Option A works with the personal account setup, the environment variables of the live project, the first deployment of the real web app, and Option B.
