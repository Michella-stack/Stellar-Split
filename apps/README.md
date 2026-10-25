# Applications

Deployable Stellar-Split services live here.

- `web`: human-facing Vite + React single-page application styled with Tailwind CSS. Freighter is the Testnet wallet and remains behind the dedicated wallet adapter.
- `api`: Node.js JavaScript REST resource server and orchestration layer, with Supabase PostgreSQL as the off-chain ledger behind repository interfaces.
- `workers`: deferred scaffolding for post-hackathon chain verification, indexing, reconciliation, and webhook processes; not required by the current build focus.

Application code uses `.js`, ES modules, JSDoc, and runtime validation at external boundaries. React, Tailwind, and the Freighter adapter belong only to the web application. Components must access Freighter through `web/src/wallets/freighter`, never through the extension API directly. The required first settlement is a plain Testnet USDC transfer; Soroban contract `settle` integration follows after that path works.

Applications may compose shared packages, but must not import internals from another application. See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
