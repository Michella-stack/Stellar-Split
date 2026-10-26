# 0011. Expenses can be entered in another currency; the balance stays in the group's asset

- **Status:** Accepted, 2026-10-26. Agreed with Victor Estival (told to us by Damaris Castro), who decided ADR 0010. Amends 0010: its rule that the asset of a group is fixed and nothing converts stays; its rejection of "one asset per expense" and of "convert at a rate" is replaced by the decision below. Not yet tested against the live database (needs migration 006).
- **Related:** ADR 0010, `database/migrations/006_expense_original_currency.sql`, `packages/shared/src/currency.js`.

## Context

ADR 0010 made a group settle in one asset and rejected converting, because balances are plain decimals and mixing two currencies would add dollars and euros. In practice people in one group spend in their own currency: a trip with someone paying in pesos and someone else in euros. Forcing everyone to convert in their head and type the result is the part of splitting money people dislike most.

## Decision

1. **The balance of a group stays in one asset, USDC or EURC**, chosen when the group is created and fixed afterwards. Settlements, intents, balances, agent caps and the on-chain check are unchanged.
2. **An expense can be entered in another currency**: USD, EUR, MXN, COP, BRL or GBP (`EXPENSE_CURRENCIES`), other than the group's own (USDC counts as USD, EURC as EUR). It is **converted once, when it is saved**, at a rate, and the converted amount is what the balance uses.
3. **The original amount, its currency and the rate are stored with the expense** (`original_amount`, `original_currency`, `rate`, all empty for an ordinary expense). Nothing is ever repriced: a later change in the market does not move an old balance. The rate is "units of the original currency per 1 unit of the group's currency".
4. **The conversion is integer arithmetic** (`convertToStroops`, rounded half up). Exact shares typed in the original currency are converted together (`convertShares`) so they add up to exactly the converted total, with the leftover stroops going to the shares that lost the most.
5. **The API converts and checks**: with `original` in the request it computes the amount itself; a client that also sends `amount` must match (`AMOUNT_RATE_MISMATCH`). The currency must be known and not the group's own, the rate between 0.001 and 1,000,000, and the result positive and within the limit.
6. **The web proposes the rate** from the rates it already loads (live from a public API, or a fixed sample table when offline, and says which), and lets the person type another one, for example what their card charged. The scan of a receipt in a known currency fills the form in that currency.

## Consequences

- Existing groups and expenses are unchanged, and so are payments, intents and agent caps: they only ever see the converted amount.
- **The rate is not verified.** The API checks that it is sane and that the amounts agree with it, not that it is the market rate. This adds no new kind of trust: the amount of an expense was already typed by a member, and a member can type any amount. A group of friends who do not trust each other's numbers has the same problem with or without this.
- An expense in another currency shows what was typed and what it counts for ("MXN 370.00 ≈ $20.00"). The group total in the spending summary is in the group's asset.
- The agent cap simplification of ADR 0010 is unchanged: caps count the group's own asset as one unit.
- Until migration 006 is run, saving an expense in another currency fails at the database; every other expense works.
- Home-currency estimates (`≈ €4`) stay display only, as before.

## Alternatives considered

- **Keep balances per currency** and settle each one separately. Honest, but a person who owes in three currencies has three debts and three payments, and a group of friends does not want that.
- **Look the rate up on the server** and ignore the client's. More trustworthy and a new dependency on every save in a serverless function; the person also could not enter the rate their bank gave them. Possible later without changing the data model, because the rate is already stored.
- **Round the converted amount to cents.** Looks tidier, but then exact splits need a second rounding rule. Amounts keep 7 decimals like every equal split already does, and are shown to 2.
