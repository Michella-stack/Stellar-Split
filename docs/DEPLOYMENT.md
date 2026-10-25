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
| Content served | The real web app, from commit `b720476` (merge of #66). The first two deployments were made by hand and served a placeholder page |
| Automatic deploys from GitHub | **Working through Option B** (GitHub Actions). The first production run succeeded and the deployment carries the commit. Option A (Vercel Git integration) is not connected |

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

**Option B, used while Option A is not possible: GitHub Actions** (`.github/workflows/vercel-deploy.yml`). On every push to `main` it deploys to production, and on every pull request from this repository it makes a preview deployment. Vercel builds it from `vercel.json`, then the job calls `/v1/health` on the new deployment. Pull requests from forks never receive secrets and are not deployed.

To switch it on, two people are needed once:

1. The owner of the Vercel project creates a token at https://vercel.com/account/tokens, scoped to the team `vestival's projects`, with the shortest expiry that is practical, and gives it to Michella privately (not in chat or in the repository).
2. An administrator of the repository (Michella) adds three secrets in *Settings*, *Secrets and variables*, *Actions*:

| Secret | Value |
|---|---|
| `VERCEL_TOKEN` | The token from step 1 |
| `VERCEL_ORG_ID` | `team_mBzhC3YpoNFezzITJmlHxkGW` (the team id; an identifier, not a secret) |
| `VERCEL_PROJECT_ID` | The id of project `stellar-split` (*Settings* of the project, *General*) |

A secret pasted with a trailing space or line break makes Vercel answer `forbidden` (seen once with `VERCEL_ORG_ID`, 30 characters instead of 29): type the values by hand. Until the secrets exist the workflow skips with a notice and stays green. Remove the Vercel Git integration if Option A is later connected, otherwise every commit deploys twice.

Limits of this option:

- The token can deploy every project in that Vercel team. A pull request from a branch of this repository can change the workflow and read the secrets, so only give write access to people who may deploy. Treat the token as a production credential and rotate it when someone leaves.
- The Vercel CLI version is pinned in the workflow (`vercel@64.5.0`, past the 7 day cooldown) and has to be bumped by hand.
- It deploys the source of the commit. It does not wait for the other checks (`web`, `contracts`) to pass: a red check does not stop a deployment. Branch protection on `main` is what keeps broken code out.

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
| `ALLOW_MEMORY_STORE` | API | Local development and Preview only. The API refuses to start with it when `VERCEL_ENV` is `production` |

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

That Option A works with the personal account setup, the environment variables of the live project, and the preview deployments of Option B on a real pull request (only the production run has been seen). The health check passes, but sign-in and any route that needs Supabase have not been tried on the live URL.
