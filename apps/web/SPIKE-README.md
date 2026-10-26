# Wallets spike. Do not merge.

Branch `spike/wallets-kit`, 2026-10-26. It adds `@creit.tech/stellar-wallets-kit` 2.7.1 and a throwaway entry (`spike.html`, `src/spike-wallets.js`, `vite.spike.config.js`) that loads the kit with only the Freighter, xBull and Albedo modules, so the bundle size and the CSP could be measured. Nothing in the app uses it.

Reproduce: `cd apps/web && npm ci --ignore-scripts && npx vite build -c vite.spike.config.js`. The results are in `docs/WALLETS.md` section 7 (on the docs branch).
