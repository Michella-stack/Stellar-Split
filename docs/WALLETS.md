# Wallets: Freighter now, more wallets later

Status: analysis and roadmap, 2026-10-25. **Paused**: nothing here is built. The decision is in [ADR 0007](adr/0007-more-wallets-after-freighter-is-roadmap.md). Network: Stellar Testnet only.

## 1. Where we are

The required demo uses **Freighter only** (`docs/BUILD-FOCUS.md`). All Freighter code lives in one module, `apps/web/src/wallets/freighter/adapter.js`, the only file that imports `@stellar/freighter-api`. Its surface is small: `isAvailable`, `connect`, `getNetwork` / `assertTestnet`, `getConnectedAddress`, `signTransaction`, `signMessage` and `watch`. Each signature first re-reads the account and the network and checks the transaction against what the person reviewed (`intent.js`).

What is still Freighter-shaped: `WalletProvider.jsx` (the `watch` loop, reconnection, the "disconnected" flag), the error mapping in `errors.js`, and the copy on the connect screens.

Sign-in uses a **SEP-53 signed message** (`signMessage`). The API verifies that signature, so a wallet that cannot sign messages cannot sign in with the current API.

## 2. Options considered

| Option | What it is | Verdict |
|---|---|---|
| **Stellar Wallets Kit** | One library over many wallets: xBull, Albedo, Freighter, Rabet, WalletConnect, Lobstr, Hana, HOT, Klever, OneKey, Bitget, and (per the Stellar docs) Ledger, Trezor and Scopuly. Version 2.7.1 on npm (2026-10-07). Its docs list `signMessage`, `signAuthEntry` and `signAndSubmitTransaction` | The way to go when this is scheduled. Load only the modules we need |
| One SDK per wallet | Write an adapter for each wallet | More code and more dependencies to review, no benefit over the kit |
| **Blux** | Hosted wallet infrastructure with a prebuilt modal and hooks. Sign in with email, social accounts or passkeys, or connect a wallet. Has a dashboard | Not recommended (section 4) |
| **Privy, Dfns** | Wallets created and managed by the platform | Do not fit the non-custodial model |
| Account Viewer | A small open source wallet | Reference only |

Sources: [Stellar developer docs, wallet integration](https://developers.stellar.org/docs/tools/developer-tools/wallets), [Stellar Wallets Kit README](https://github.com/Creit-Tech/Stellar-Wallets-Kit), [kit API docs](https://jsr.io/@creit-tech/stellar-wallets-kit/doc), [SEP-43 (standard wallet interface, draft)](https://stellar.org/protocol/sep-43).

## 3. Effort (estimates, not measurements)

| Piece | Estimate | Notes |
|---|---|---|
| Common wallet layer: an interface, Freighter as one implementation, a generic provider | 1 to 1.5 days | Touches the provider and its tests |
| Wallet picker and the extension modules (xBull, Albedo, Lobstr, Hana) through the kit | 1 to 2 days | Little code, but the CSP has to be adjusted |
| Sign-in for wallets that cannot sign messages | 1 to 2 days | A SEP-10 style challenge transaction, the fallback already named in ADR 0005. Changes the API and the web app |
| Mobile through WalletConnect, and Ledger | 1 to 2 days more | Large dependencies, a Reown project ID, more CSP changes |
| Testing each wallet for real | Half a day per wallet | Needs the wallet and a Testnet account. Cannot be automated |

Two or three extension wallets: about 3 to 4 days. The full list including mobile and hardware: one to one and a half weeks. Adding one wallet that needs no extension (for example Albedo) behind the common layer: about 2 to 2.5 days including tests.

## 4. Risks

- **Supply chain.** The kit depends on 20 packages, among them WalletConnect, Reown, Ledger, Trezor, MetaMask and the Stellar SDK. Our rules are exact versions, a lockfile, signature checks, a version guard and a cooldown (7 days, 14 for `@stellar/*`). Use only the wallet modules we ship, never `defaultModules()`, and review the resulting lockfile.
- **CSP.** The current policy is `script-src 'self'`, `style-src 'self'` plus Google Fonts and a `connect-src` limited to Horizon and Friendbot (`vercel.json`). The kit's own interface, Albedo's popup and WalletConnect's relay will probably need it loosened. Not tried.
- **Message signing.** Which wallets sign SEP-53 messages is not verified. The ones that do not need the challenge transaction fallback.
- **Network check.** The kit's docs say some wallets (Lobstr, Rabet) do not let the app choose the network, so the kit asks the wallet which one it is on. Our "refuse unless Testnet" check is weaker there.
- **Trust model.** Email, social or passkey sign-in (Blux, Privy) means keys managed by a third party. The app today relies on the person signing each payment with their own wallet, and `checkIntent` is built for that. Not compatible without a new design and an ADR.
- **Vendor risk.** Blux needs an account, API keys and a dashboard we would not control. Its documentation, terms and Testnet support were not read.

## 5. Spike, when this is picked up

Half a day, in a branch, no merge. It turns the estimates above into numbers.

1. Add the kit with only the Freighter, xBull and Albedo modules. Record the bundle size and the added packages.
2. Load it on a preview deployment with the real CSP. List every directive that has to change.
3. Try `signMessage` on each wallet. Record which return a SEP-53 signature the API accepts.
4. Check `getNetwork` on each wallet, and what the app can still refuse.
5. Write the findings in this file and update ADR 0007.

## 6. Not verified

Every effort number; which wallets sign messages; how the kit's interface behaves under our CSP; the real bundle size; what Blux offers beyond its docs page; how the kit handles our "refuse on another network" rule.
