# Shared packages

Reusable, transport-independent Stellar-Split JavaScript modules live here. They use ES modules, JSDoc for static analysis, and runtime schemas where data crosses a trust boundary.

- `policy-engine`: agent policy decisions. Today it holds the server-enforced spend caps (issue #13). Approvals and velocity checks are deferred.
- `shared`: domain schemas, stable errors, IDs, events, and canonicalization.
- `stellar`: Stellar network and contract adapters.
- `x402`: isolated x402 resource-server and agent-client integration.

Keep dependency direction inward: packages must never import application code. React, Tailwind, and Freighter dependencies remain in `apps/web` and are not shared domain dependencies.
