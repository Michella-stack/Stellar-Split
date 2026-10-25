# Applications

Deployable Stellar-Split services live here.

- `web`: human-facing, server-rendered React application styled with Tailwind CSS. Freighter is the testnet wallet; browser hydration is reserved for wallet and interactive flows.
- `api`: JavaScript REST resource server and orchestration layer.
- `workers`: deferred scaffolding for post-hackathon chain verification, indexing, reconciliation, and webhook processes; not required by the current build focus.

Application code uses `.js`, ES modules, JSDoc, and runtime validation at external boundaries. React, Tailwind, and the Freighter adapter belong only to the web application. Components must access Freighter through `web/src/wallets/freighter`, never through the extension API directly.

Applications may compose shared packages, but must not import internals from another application. See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
