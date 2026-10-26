// The spending summary across all of a person's groups. Each group counts in its own asset, so to add them up every
// expense is put in one currency (the person's home currency) at today's rates. That is an estimate for display: it is
// never stored and never moves a balance.

import { fromStroops, toStroops } from '@shared/money.js';

/**
 * An amount in stroops of one currency as stroops of another, through the per-dollar rates, rounded half up.
 * @param {bigint} stroops
 * @param {string} from ISO code, e.g. 'EUR'
 * @param {string} to
 * @param {Readonly<Record<string, string>>} ratesPerUsd units of each currency per 1 USD
 */
export function convertDisplay(stroops, from, to, ratesPerUsd) {
  if (from === to) return stroops;
  const source = toStroops(ratesPerUsd[from]);
  const target = toStroops(ratesPerUsd[to]);
  return (2n * stroops * target + source) / (2n * source);
}

/**
 * Expenses of several groups as one list in `home`. A person's own share becomes a share of the member "me" in every group,
 * so the same bucketing as for one group works on the list.
 * @param {{ groupId: string, groupName: string, currency: string, me: string, expenses: { amount: string, createdAt: string, paidBy: string,
 *   shares?: { memberId: string, amount: string }[] }[] }[]} loaded
 * @param {string} home
 * @param {Readonly<Record<string, string>>} ratesPerUsd
 * @returns {{ expenses: { groupId: string, createdAt: string, amount: string, paidBy: string, shares: { memberId: string, amount: string }[] }[], converted: boolean }}
 */
export function pool(loaded, home, ratesPerUsd) {
  const expenses = [];
  let converted = false;
  for (const group of loaded) {
    if (group.expenses.length > 0 && group.currency !== home) converted = true;
    const inHome = (value) => fromStroops(convertDisplay(toStroops(value), group.currency, home, ratesPerUsd), { minDecimals: 2 });
    for (const expense of group.expenses) {
      const mine = expense.shares?.find((s) => s.memberId === group.me);
      expenses.push({
        groupId: group.groupId,
        createdAt: expense.createdAt,
        amount: inHome(expense.amount),
        paidBy: expense.paidBy === group.me ? 'me' : expense.paidBy,
        shares: mine ? [{ memberId: 'me', amount: inHome(mine.amount) }] : [],
      });
    }
  }
  return { expenses, converted };
}

/**
 * What happened inside the range the buckets cover: the total, the person's share, what they paid, the number of expenses
 * and the same per group.
 * @param {ReturnType<typeof pool>['expenses']} expenses
 * @param {{ start: Date, end: Date }[]} buckets
 * @returns {{ total: bigint, mine: bigint, paid: bigint, count: number, perGroup: { groupId: string, total: bigint, mine: bigint }[] }}
 */
export function rangeTotals(expenses, buckets) {
  const from = buckets[0].start;
  const to = buckets.at(-1).end;
  const perGroup = new Map();
  const out = { total: 0n, mine: 0n, paid: 0n, count: 0, perGroup: [] };
  for (const expense of expenses) {
    const at = new Date(expense.createdAt);
    if (at < from || at >= to) continue;
    const total = toStroops(expense.amount);
    const mine = expense.shares.reduce((sum, s) => sum + toStroops(s.amount), 0n);
    out.total += total;
    out.mine += mine;
    out.count += 1;
    if (expense.paidBy === 'me') out.paid += total;
    const row = perGroup.get(expense.groupId) ?? { groupId: expense.groupId, total: 0n, mine: 0n };
    row.total += total;
    row.mine += mine;
    perGroup.set(expense.groupId, row);
  }
  out.perGroup = [...perGroup.values()];
  return out;
}
