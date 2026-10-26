# Wallets: Freighter now, more wallets later

Status: analysis and roadmap, 2026-10-25, with the **spike result of 2026-10-26 in section 7**. **Paused**: nothing here is built. The decision is in [ADR 0008](adr/0008-more-wallets-after-freighter-is-roadmap.md). Network: Stellar Testnet only.

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
5. Write the findings in this file and update ADR 0008.

## 6. Not verified

Every effort number; which wallets sign messages; how the kit's interface behaves under our CSP; the real bundle size; what Blux offers beyond its docs page; how the kit handles our "refuse on another network" rule.

## 7. Spike result, 2026-10-26

The half-day spike of section 5, done on the branch `spike/wallets-kit` (not for merge). Network: Stellar Testnet. What was measured, and what could not be.

**Corrections to sections 2 to 4.** The npm name of the kit is `@creit.tech/stellar-wallets-kit` (with a dot); the name in the links, `@creit-tech/...`, is the JSR one and does not exist on npm. Version 2.7.1 was published on 2026-10-07 and is MIT. "Depends on 20 packages" is true of its direct dependencies; the full tree is much larger (below).

### What the kit adds (measured)

| | Before | With the kit | Note |
|---|---|---|---|
| Packages in `apps/web/package-lock.json` | 262 | **649** (+387) | 299 new top-level, 88 nested copies. npm installs **every** dependency of the kit, even if only three modules are imported |
| `npm audit` | 0 | **29** (12 low, 6 moderate, 11 high) | All in transitive packages of wallets we would not ship: Reown AppKit, Coinbase, NEAR, Solana, HOT. None in the three we would |
| Packages with an install script | 0 | 4 | `@reown/appkit`, `secp256k1`, `bufferutil`, `utf-8-validate` (installed with `--ignore-scripts`) |
| Own copy of Freighter's API | 6.0.1 | 6.0.1 and 6.0.0 | The kit pins `@stellar/freighter-api` 6.0.0 |
| JavaScript for a page with the kit, Freighter, xBull and Albedo | | 201 kB, **64 kB gzip** | A separate entry, not measured inside the app; our whole app is 1,077 kB, 307 kB gzip |

The bundle is small because only the imported modules are bundled. The cost is in the dependency tree and the audit, which our supply chain rules (section 4) count.

### CSP (measured, headless Chrome with the policy of `vercel.json`)

- The kit **loads and initialises** under `script-src 'self'`.
- It injects an inline `<style>` when it starts. `style-src 'self' https://fonts.googleapis.com` **blocks it, and its wallet picker does not appear** at all.
- With `style-src ... 'unsafe-inline'` the picker appears (xBull, Albedo, Freighter), but it loads the wallet icons from `https://stellar.creit.tech`, which `img-src` also blocks.
- So the kit's own interface needs a weaker `style-src` and a new `img-src` host. A hash does not help, because the kit's stylesheet is generated at run time. Using the kit without its picker, with our own screen, was not tried.
- Not tested: the popups, iframes and connections that Albedo, xBull and WalletConnect open (they may need `frame-src` or `connect-src`), because that needs the real wallets.

### Message signing and network, from each module's source

The sign-in of section 1 asks the wallet to sign a SEP-53 message. This is what the kit's modules do, read from their code. It says whether the method is offered, **not** whether the signature is the SEP-53 one the API verifies.

| Wallet | `signMessage` | `getNetwork` |
|---|---|---|
| Freighter | offered | offered |
| xBull | offered | **not supported** |
| Lobstr | offered | **not supported** |
| Hana | offered | **not supported** |
| OneKey | offered | **not supported** |
| Albedo | **not supported** | **not supported** |
| Rabet | **not supported** | **not supported** |
| Ledger, Trezor | **not supported** | **not supported** |
| WalletConnect | offered | **not supported** |

- A wallet without `signMessage` (Albedo, Rabet, hardware wallets) cannot sign in with the current API. It needs the challenge transaction fallback of ADR 0005, which changes the API.
- For every wallet except Freighter the app **cannot ask the wallet which network it is on**. Our check "refuse unless Testnet" works through Freighter only. What happens when another wallet is on the public network is not verified.

### The alternative the ADR rejected: one SDK per wallet

Section 2 called it more code and more dependencies for no benefit. Measured for xBull, Albedo and Lobstr together (`@creit.tech/xbull-wallet-connect` 0.4.0, `@albedo-link/intent` 0.12.0, `@lobstrco/signer-extension-api` 2.0.0):

- **7 packages in total** (the three plus `rxjs`, `tslib`, `tweetnacl`, `tweetnacl-util`), **0 audit findings, no install scripts**.
- **Licences, to be decided by the team:** Albedo is MIT. **Lobstr 2.0.0, the version the kit pins, is GPL-3.0** (2.1.0 is Apache-2.0). **xBull's `xbull-wallet-connect` 0.4.0 declares no licence.** This repository is MIT. Using the kit would bring the GPL-3.0 package in with it.

### What this changes

1. ADR 0008 point 2 ("use Stellar Wallets Kit") is not supported by these numbers. The kit costs 387 packages, 29 audit findings and a weaker CSP for three wallets. Calling the wallets' own SDKs behind our adapter (point 5 of the ADR) costs 7 packages and no findings, at the price of writing one small adapter per wallet.
2. Of the three, **only wallets that offer `signMessage` can be added without an API change**: xBull, Lobstr and Hana. Albedo, the one that needs no extension, is the one that does need the challenge transaction.
3. The licence of Lobstr 2.0.0 and the missing licence of xBull's SDK need a decision before either is added.

### Still not verified

No real wallet was run, so: that xBull's, Lobstr's or Hana's `signMessage` returns a signature our API accepts; how each behaves on Testnet and on another network; the popups and frames under the CSP; mobile and hardware wallets; the size of our own adapters inside the app. Every effort number of section 3 is still an estimate.

