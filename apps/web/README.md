# Stellar Split web app

React single-page app for Stellar Split, built with Vite and Tailwind CSS v4. Stellar Testnet only. See [ADR 0001](../../docs/adr/0001-web-vite-spa.md) for why it is an SPA.

## Run it

Requires Node.js 24 (see `.nvmrc`).

```sh
cd apps/web
npm ci --ignore-scripts
cp .env.example .env
npm run dev        # http://localhost:5173
```

Other scripts: `npm test` (Vitest), `npm run lint` (ESLint), `npm run build`, `npm run preview`.

## Environment variables

All `VITE_` variables are compiled into the browser bundle, so none of them may hold a secret. Defaults are in `.env.example`.

| Variable | Purpose |
|---|---|
| `VITE_USE_MOCKS` | `true` serves local mock data instead of calling the API. |
| `VITE_API_URL` | Base URL of the Stellar-Split API. |
| `VITE_HORIZON_URL` | Stellar Testnet Horizon. |
| `VITE_USDC_ISSUER` | Issuer of Testnet USDC (verified before the settlement phase). |
| `VITE_NETWORK` | Must be `testnet`. |

## Layout

```
src/
├── routes/              one module per screen, plus the router (index.jsx)
├── components/          reusable, accessible UI primitives
├── features/            groups, expenses, balances, settlement, assist
├── hooks/
├── wallets/freighter/   the only module that imports @stellar/freighter-api
├── client/              api.js (mock or real), stellar.js (Horizon), mocks/
├── lib/                 browser-side helpers (theme, formatting)
└── styles/app.css       Tailwind entry and theme tokens
```

## Theme

Dark is the default. On first load the app follows `prefers-color-scheme: light`; after that the saved choice wins. Colours are CSS variables on `:root[data-theme]`, mapped into Tailwind through `@theme` (`bg-surface`, `text-muted`, `text-owe`, `bg-accent`, ...). The accent is one variable, switched with `data-accent` (`lime`, `cyan`, `orange`, `violet`).
