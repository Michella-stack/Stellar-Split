# ADR 0001: The web app is a Vite single-page app

- Status: accepted
- Date: 2026-10-25
- Deciders: Stellar-Split team (web)

## Context

`docs/ARCHITECTURE.md` (architecture branch) suggests server rendering "when supported by the selected framework", with `apps/web/src/client` for hydration and `apps/web/src/server` for SSR, the API client and sessions. The PRD described "server-rendered pages with minimal client JS".

For HackMeridian we have about a day and a half. Every screen that matters for the demo is interactive and wallet-bound: Freighter only exists in the browser, so connect, sign-in, review and settlement run on the client anyway. The API is built in parallel by other team members, and the web app has to run on mock data until it is ready.

## Decision

Build `apps/web` as a client-side single-page app with Vite, React and `react-router`, in plain JavaScript (ES modules, JSDoc) with Tailwind CSS v4.

- No SSR and no `src/server` folder. `src/client` holds the API client (`api.js`, mock or real) and the Horizon client (`stellar.js`), not hydration code.
- `src/lib` holds browser-side helpers such as formatting. Money and split rules that the API also needs go in `packages/shared`.
- The production build is static files that any static host can serve.

## Consequences

- Simpler build, one runtime, fast iteration, no server to deploy for the front end.
- No server-side session handling in the web app: the SEP-10 style session from the API is held in memory or in browser storage, and the API stays the trusted boundary.
- First paint needs JavaScript. A small external script (`public/theme-init.js`) sets the theme before paint so the Content Security Policy can stay without `unsafe-inline`.
- Search engines see an empty shell. That does not matter for a wallet app on Testnet.
- If SSR becomes useful later (public receipts, shareable group pages), the route modules and features can move to a framework with SSR; the Freighter adapter and API client do not change.
