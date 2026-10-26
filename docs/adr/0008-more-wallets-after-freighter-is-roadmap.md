# 0008. More wallets after Freighter are a roadmap item, not the demo

- **Status:** Accepted as a roadmap item on 2026-10-25. **Paused**, not scheduled. Decided by Victor Estival. Not yet reviewed by the rest of the team.
- **Related:** `docs/WALLETS.md` (analysis, effort, risks), `docs/BUILD-FOCUS.md`, ADR 0005 (fallback sign-in by challenge transaction).

## Context

The required demo is the human flow with Freighter. People who use other Stellar wallets, or none, cannot use the app. The question was how much work it is to support the main Stellar wallets, and whether a ready-made tool saves time.

## Decision

1. **Keep Freighter as the only wallet for the hackathon.** Another wallet adds risk to a payment flow that has not yet been tried end to end on the public deployment.
2. **When this is scheduled, use Stellar Wallets Kit** behind a small common wallet layer, with only the modules we ship (never the default set), reviewed under the supply chain rules.
3. **Do not use a hosted wallet service** (Blux, Privy, Dfns) for now. They bring keys managed by a third party and an outside account, which does not fit the non-custodial model the app and `checkIntent` are built on. Revisit only with a new ADR.
4. **Before committing, run the half day spike** in `docs/WALLETS.md` section 5, then update this record.
5. Keep all Freighter code behind `apps/web/src/wallets/freighter/adapter.js` so nothing else needs to change later.

## Consequences

- No work now. The estimates (about 3 to 4 days for two or three extension wallets, one to one and a half weeks for everything) are not measured.
- Wallets that cannot sign messages will need the challenge transaction sign-in, which changes the API.
- The CSP will probably need to be loosened for the kit's interface, Albedo or WalletConnect. That is a security decision to review at that point.

## Alternatives considered

- **One SDK per wallet.** More code and more dependencies for the same result.
- **Blux, Privy, Dfns.** Faster onboarding for people without a wallet, at the price of the trust model and a vendor. Not read in detail.
- **Support more wallets now.** Rejected for the hackathon scope.

## Not verified

Which wallets sign SEP-53 messages, the kit under our CSP, its real bundle size, and Blux beyond its documentation page. See `docs/WALLETS.md` section 6.

## Update, 2026-10-26: the spike

The half-day spike of point 4 was done (`docs/WALLETS.md` section 7). The decision to keep Freighter only for the hackathon stands, and the item stays **paused**. What the spike changes in this record:

- **Point 2 is not supported by the numbers.** Stellar Wallets Kit adds 387 packages and 29 `npm audit` findings (11 high) to an app that has none, and its picker is blocked by our CSP unless `style-src` allows inline styles and `img-src` allows `stellar.creit.tech`. The wallets' own SDKs behind our adapter (point 5) add 7 packages and no findings. If this is scheduled, start from those and treat the kit as the rejected option.
- **Only wallets that offer `signMessage` avoid an API change:** xBull, Lobstr and Hana. Albedo, Rabet and the hardware wallets do not offer it.
- **Our "refuse unless Testnet" check works through Freighter only.** The other wallets cannot be asked for their network.
- **Licences need a decision:** Lobstr's SDK 2.0.0 is GPL-3.0 and xBull's SDK 0.4.0 declares none, in an MIT repository.
- Not verified, because no real wallet was run: that those signatures are accepted by the API, the wallets' popups under the CSP, Testnet behaviour.

