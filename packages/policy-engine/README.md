# @stellar-split/policy-engine

Agent policy decisions that the API enforces on the server, so that no limit depends on the agent behaving (PRD 7.4, issue #13). Plain JavaScript (ES modules, JSDoc), no dependencies beyond [`packages/shared`](../shared), Node.js 22 or later.

| Module | What it does |
|---|---|
| `spend.js` | `checkSpend({ amount, committed, caps, now })` decides whether an agent may commit `amount` more. It checks a per-payment cap, a rolling 24-hour cap and a rolling 30-day cap. The PRD defaults are 25, 50 and 200 USDC. |

`committed` is the agent's earlier settlement intents. Those that may have moved money count: `reserved`, `settled`, `expired` and `needs_review`. `cancelled` and `failed` do not count. The function is pure. The API loads the intents and applies the decision in `apps/api/src/services/ledger.js`.

```sh
cd packages/policy-engine
npm test
```

Not here yet: human approval thresholds, velocity checks and the kill switch (issue #19), and owner-set caps per agent. The API takes the caps as a setting and uses the defaults today.
