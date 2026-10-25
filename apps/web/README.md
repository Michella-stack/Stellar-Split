# Stellar Split web app

React single-page app for Stellar Split, built with Vite and Tailwind CSS v4. Stellar Testnet only. See [ADR 0007](../../docs/adr/0007-web-vite-spa.md) for why it is an SPA.

## Run it

Requires Node.js 24 (see `.nvmrc`).

```sh
cd apps/web
npm ci --ignore-scripts
cp .env.example .env
npm run dev        # http://localhost:5173
```

Other scripts: `npm test` (Vitest), `npm run lint` (ESLint), `npm run build`, `npm run preview`. The shared domain rules have their own tests: `cd packages/shared && npm test`.

In development, http://localhost:5173/ui shows every UI component in the dark and light themes side by side. It is not part of production builds.

## Demo mode (no wallet needed)

The welcome screen has **Explore with sample data**. It runs the whole app on the sample groups (Casa Alfama, Algarve trip, Stellar Assist) without Freighter and without touching Stellar, so anyone can try it from the live URL. It is the same deployment, switched by a flag in `localStorage` (`stellar-split.demo`); the page reloads when it changes.

- A fixed banner on every screen says it is a demo, with **Exit demo**. Leaving forgets what was done in it.
- Payments are simulated: the same review, steps and paid screen, but nothing is signed or sent. They are marked `demo: true`, so no screen links them to an explorer, and the receipt says "DEMO".
- Balances on Wallet and Settle up are sample values. Stellar Assist runs on its sample data without the "Preview" note.
- The real mode is unchanged: connect Freighter on Testnet and sign in.

## Against the real API

Run the API (`apps/api`, see its README) and set `VITE_USE_MOCKS=false` and `VITE_API_URL=http://localhost:8080` in `.env`. The API must allow the web origin (`APP_URL=http://localhost:5173`).

Production builds read `.env.production`, which is committed. It holds only public Testnet values, and its API URL is empty because the web app and the API share one origin on Vercel. Stellar Assist stays on sample data, labelled "Preview", until the agent API exists.

This was tested end to end against the API in #51 with an in-memory store: SEP-53 sign-in, profile, a new group, adding a member by address, an expense, and a 0.30 USDC Testnet payment that the API verified on Horizon before recording it ([bd22e9a8…](https://stellar.expert/explorer/testnet/tx/bd22e9a86050c2a720b40cc950b4e0480f264b32ac029175d1c43633ab12efd5)).

## Before the demo

You need two Testnet accounts in Freighter. The payer is the account you sign in with. The creditor plays "Mateo" in the demo data.

1. In Freighter, switch the network to **Test Net**. Create a second account from the account menu if you only have one.
2. Fund both accounts with test XLM: **Wallet → Fund with Friendbot** in the app, or the Friendbot button in Freighter.
3. Give both accounts a USDC trustline. "Settle up" offers **Add USDC trustline** when it is missing, or use Freighter → Manage assets with issuer `GBBD47IF…LFLA5`.
4. Get testnet USDC for the payer from https://faucet.circle.com (Stellar Testnet).
5. Put the creditor's **public** address in `.env` as `VITE_MOCK_MATEO_ADDRESS`, restart `npm run dev` and open a new tab. Mock data is kept per tab.

## Demo script (about 3 minutes)

1. **Welcome:** “Different currencies. One balance.” Click **Connect Freighter wallet** and approve.
2. **Sign in:** click **Sign in with Freighter**. Freighter shows a single data entry: it costs nothing and is never sent.
3. **Profile:** enter your name and home currency (EUR).
4. **Your groups:** you owe $364.60 in Casa Alfama, and Algarve trip owes you $36.00, each with a € estimate.
5. **Casa Alfama:** members from four countries, the accent card “You owe Mateo $364.60 · ≈ €325” (the estimate follows the day's exchange rate), and everyone else's balance in words.
6. **Add expense → Enter it yourself:** 30 for Internet, split **Exact amounts**. The check reads “Adds up to $X of $30.00” until it matches. Save it and the balances update.
7. **Settle up with Mateo:** the review shows your available USDC. If it is short, use **Pay $X to Mateo instead** (a partial payment), then **Confirm in Freighter**. Freighter shows the same recipient, amount and asset.
8. **Paid:** open the transaction on Stellar Expert, then **Save receipt** (PNG).
9. **Stellar Assist:** set the rules ($25 per payment, ask above $5, $50 a day), approve the $7.50 internet share, then in the chat try “Pay Mateo 364.60” to show the “Over my limit” card.

Evidence from testing, both payments of Testnet USDC sent by this app to the demo creditor:
[7e15141b…](https://stellar.expert/explorer/testnet/tx/7e15141b4fa3484aa319efcc783a81df6e35ab5d77dfb0576d8c38e80af576de) (1.50 USDC) and
[fee0d278…](https://stellar.expert/explorer/testnet/tx/fee0d278e996b207c1998a60959bf85d2bf7dd0621b0b0e6376d9dd2d24d4099) (1.00 USDC).

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
- The session (the API token, never a key) is kept in `localStorage` until the API expiry (12 hours). Every tab shares one sign-in and it survives closing the browser. Disconnecting or changing account drops it, in every open tab. In mock mode the demo data is kept the same way, so a new tab does not ask for the profile again.
- The app refuses to start unless `VITE_NETWORK=testnet`, the Horizon URL is the Testnet one and `VITE_USDC_ISSUER` is a valid address (`src/config/env.js`).

### Try it with Freighter

1. Install Freighter in Chrome, create a wallet and switch it to **Test Net**.
2. `npm run dev`, open http://localhost:5173 and click **Connect Freighter wallet**.
3. Approve access, then **Sign in with Freighter** and approve the sign-in request.
4. Fill in your profile. Open **Wallet** and use **Fund with Friendbot** if the account is new.

## Settle up (Stellar Testnet)

The first settlement path is a plain USDC payment from the person who owes to the person owed (`src/client/stellar.js`, the only Horizon code). The Soroban contract `settle` can replace it later behind the same functions.

1. **Review:** amount (or a smaller partial amount, never more than the debt), recipient with short address, group, asset, network, fee and home-currency estimates.
2. **Reserve:** the API reserves a settlement intent and returns a reference (memo) and an expiry. Nobody else can settle with you or the creditor in this group until it is used, cancelled or expires (10 minutes).
3. **Checks before Freighter opens:** your account exists and has a USDC trustline, enough USDC and enough XLM for the fee; the recipient exists and has a USDC trustline; you are not paying yourself.
4. **Signing:** the adapter re-reads the network and the account and checks that the transaction matches the review, including the intent's memo (a `MEMO_HASH`) and an expiry no later than the intent's.
5. **Submit once** to Horizon, never retried. On success the hash links to Stellar Expert, and the settlement is recorded with `{ intentId, txHash }`. If nothing was sent (rejected, a failed check), the intent is cancelled so nobody stays blocked.
6. **Problems** each have their own next step: cancelled, not enough USDC, no trustline (adds one as its own signed transaction), recipient not ready, network error, timeout. A timeout or a dropped connection shows the transaction to check instead of "try again", because the payment may have gone through.

If the Freighter account or network changes before submission, the payment goes back to review.

**Settle all.** When you owe several members in a group, the group card shows **Settle all · $total** next to the single payments. It walks through them one after another with the same review, checks and signature for each, and every Paid screen offers **Next: pay …** (or "Stop here and go back to the group"). The list of who to pay travels in the route state (`features/settlement/queue.js`); each payment reads what you owe again, so a changed balance is never paid blindly.

Addresses on the Settle up review and on Wallet open the account on Stellar Expert (not in demo mode, where addresses are samples).

In mock mode, set `VITE_MOCK_MATEO_ADDRESS` to a real Testnet account with a USDC trustline so that "Settle up with Mateo" reaches it.

## Exchange rates

The "≈ €325 estimate" lines use `useEstimate()`, which redraws when live rates arrive. The rates API is allowed in the Content-Security-Policy in `vercel.json` (`connect-src`), and its attribution is shown on the Wallet screen, as its terms ask.

## Shared rules and mocks

Amounts, splits and balances come from [`packages/shared`](../../packages/shared/README.md), imported as `@shared/...`. The API client and the mock response shapes are documented in [`src/client/README.md`](src/client/README.md). Home-currency estimates (`src/lib/rates.js`) use daily rates from the free open.er-api.com API, cached for 6 hours. If they cannot be loaded, or look wrong (a rate more than 4 times away from the sample table), fixed sample rates are used and the Wallet screen says so. Estimates are display only: payments are always in USDC.

## Accessibility

- The target is WCAG 2.1 AA. `src/styles/contrast.test.js` checks every text and background pair in both themes, and every accent fill, against 4.5:1.
- The UI uses real buttons, links and labels. Touch targets are at least 44 px and focus is always visible. A “Skip to content” link is provided, and focus moves to the new screen after navigation.
- Owing and being owed are always written (“you owe”, “owes you”, “is owed”), never shown by colour alone.
- Animations respect `prefers-reduced-motion`.

## Performance

Screens load on first visit (route-level code splitting). The Stellar SDK loads only for sign-in, payments and the Wallet screen. Address checks use the shared `isValidStellarAddress`, which needs no SDK.

## Theme

Dark is the default. On first load the app follows `prefers-color-scheme: light`; after that the saved choice wins. Colours are CSS variables on `:root[data-theme]`, mapped into Tailwind through `@theme` (`bg-surface`, `text-muted`, `text-owe`, `bg-accent`, ...). The accent is one variable, switched with `data-accent` (`lime`, `cyan`, `orange`, `violet`).
