# 0007. More wallets after Freighter are a roadmap item, not the demo

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
