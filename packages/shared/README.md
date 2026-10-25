# @stellar-split/shared

Domain rules that the web app and the API must apply the same way. Plain JavaScript (ES modules, JSDoc), no dependencies, Node.js 24.

| Module | What it does |
|---|---|
| `money.js` | Converts decimal strings to integer stroops and back (`BigInt`, 7 decimals) and validates amounts: positive, at most 7 decimals, within a limit. |
| `splits.js` | Equal split (the remainder goes to the payer, per PRD FR-11) and the exact-split check. |
| `balances.js` | Net balance per member from expenses and settlements, which always sums to zero, plus deterministic "who pays whom" suggestions. |
| `validation.js` | Secret-key detection (`S[A-Z2-7]{55}`) and the Stellar address format check. |

Money is never a JavaScript number. Use decimal strings at the edges and `BigInt` stroops for arithmetic.

```sh
cd packages/shared
npm test        # node --test, includes the 3-member / 5-expense hand calculation
```

The web app imports these modules through the `@shared` Vite alias (`apps/web/vite.config.js`).
