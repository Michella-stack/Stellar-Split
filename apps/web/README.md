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
| `VITE_USDC_ISSUER` | Issuer of Circle Testnet USDC, `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. |
| `VITE_NETWORK` | Must be `testnet`. |
| `VITE_MOCK_MATEO_ADDRESS` | Mock mode only: a real Testnet account that plays Mateo, so a demo payment can reach it. |

## Layout

```
src/
├── routes/              one module per screen, plus the router (index.jsx)
├── components/          reusable, accessible UI primitives
├── features/            groups, expenses, balances, settlement, assist
├── hooks/
├── wallets/freighter/   the only module that imports @stellar/freighter-api
├── client/              api.js (mock or real), stellar.js (Horizon), mocks/
├── lib/                 browser-side helpers (theme, formatting, rate estimates)
└── styles/app.css       Tailwind entry and theme tokens
```

## Wallet

`src/wallets/freighter/adapter.js` is the only module that imports `@stellar/freighter-api`. Screens use `useWallet()` from the `WalletProvider`.

- Error codes are `NOT_INSTALLED`, `LOCKED`, `USER_REJECTED`, `WRONG_NETWORK`, `ACCOUNT_CHANGED`, `INTENT_MISMATCH` and `UNKNOWN`.
- Before every signature, the adapter reads Freighter's network and account again and refuses anything that is not Testnet or not the reviewed account. It then checks that the transaction matches the reviewed intent (`intent.js`: recipient, amount, asset, a single operation, an expiry time) and pins the Testnet passphrase.
- An account or network change bumps `epoch` and clears the session. Anything reviewed under an older epoch must be reviewed again.
- With `VITE_USE_MOCKS=true`, sign-in still asks Freighter for a real signature. The mock builds a SEP-10 style challenge (a single data entry that is never submitted) and checks the signature. The signed-in wallet then takes the place of "you" in the demo data.
- The session (API token, never keys) is kept in `sessionStorage` for the current tab, so a reload keeps you signed in. Closing the tab, changing account or disconnecting drops it. In mock mode the demo data is kept the same way.
- The app refuses to start unless `VITE_NETWORK=testnet`, the Horizon URL is the Testnet one and `VITE_USDC_ISSUER` is a valid address (`src/config/env.js`).

### Try it with Freighter

1. Install Freighter in Chrome, create a wallet and switch it to **Test Net**.
2. `npm run dev`, open http://localhost:5173 and click **Connect Freighter wallet**.
3. Approve access, then **Sign in with Freighter** and approve the sign-in request.
4. Fill in your profile. Open **Wallet** and use **Fund with Friendbot** if the account is new.

## Settle up (Stellar Testnet)

The first settlement path is a plain USDC payment from the person who owes to the person owed (`src/client/stellar.js`, the only Horizon code). The Soroban contract `settle` can replace it later behind the same functions.

1. **Review:** amount (or a smaller partial amount, never more than the debt), recipient with short address, group, asset, network, fee and home-currency estimates.
2. **Checks before Freighter opens:** your account exists and has a USDC trustline, enough USDC and enough XLM for the fee; the recipient exists and has a USDC trustline; you are not paying yourself.
3. **Signing:** the adapter re-reads the network and the account and checks the transaction matches the review.
4. **Submit once** to Horizon, never retried. On success the hash links to Stellar Expert and the settlement is recorded through the API.
5. **Problems** each have their own next step: cancelled, not enough USDC, no trustline (adds one as its own signed transaction), recipient not ready, network error, timeout. A timeout or a dropped connection shows the transaction to check instead of "try again", because the payment may have gone through.

If the Freighter account or network changes before submission, the payment goes back to review.

In mock mode, set `VITE_MOCK_MATEO_ADDRESS` to a real Testnet account with a USDC trustline so that "Settle up with Mateo" reaches it.

## Shared rules and mocks

Amounts, splits and balances come from [`packages/shared`](../../packages/shared/README.md), imported as `@shared/...`. The API client and the mock response shapes are documented in [`src/client/README.md`](src/client/README.md). Home-currency estimates (`src/lib/rates.js`) use a fixed mock rate table for now.

## Theme

Dark is the default. On first load the app follows `prefers-color-scheme: light`; after that the saved choice wins. Colours are CSS variables on `:root[data-theme]`, mapped into Tailwind through `@theme` (`bg-surface`, `text-muted`, `text-owe`, `bg-accent`, ...). The accent is one variable, switched with `data-accent` (`lime`, `cyan`, `orange`, `violet`).
