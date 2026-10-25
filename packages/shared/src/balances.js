// Net balances and settle-up suggestions. Positive net: the member is owed money. Negative: the member owes.

import { toStroops } from './money.js';
import { checkExactSplit, splitEqual } from './splits.js';

/**
 * @typedef {{ type: 'equal', participants: string[] } | { type: 'exact', shares: { memberId: string, amount: string }[] }} Split
 * @typedef {{ amount: string, paidBy: string, split: Split }} ExpenseInput  amounts are decimal strings
 * @typedef {{ from: string, to: string, amount: string }} SettlementInput  from pays to
 */

/**
 * Shares of one expense, in stroops.
 * @param {ExpenseInput} expense
 * @returns {Map<string, bigint>}
 */
export function expenseShares(expense) {
  const total = toStroops(expense.amount);
  if (expense.split.type === 'equal') return splitEqual(total, expense.split.participants, expense.paidBy);
  const shares = new Map(expense.split.shares.map((s) => [s.memberId, toStroops(s.amount)]));
  if (!checkExactSplit(total, [...shares.values()]).ok) throw new Error('Exact shares do not add up to the amount');
  return shares;
}

/**
 * Net balance per member from expenses and completed settlements. The result always sums to zero.
 * @param {string[]} memberIds
 * @param {ExpenseInput[]} expenses
 * @param {SettlementInput[]} [settlements]
 * @returns {Map<string, bigint>}
 */
export function netBalances(memberIds, expenses, settlements = []) {
  const net = new Map(memberIds.map((id) => [id, 0n]));
  const add = (id, delta) => {
    if (!net.has(id)) throw new Error(`Unknown member: ${id}`);
    net.set(id, net.get(id) + delta);
  };
  for (const expense of expenses) {
    add(expense.paidBy, toStroops(expense.amount));
    for (const [id, share] of expenseShares(expense)) add(id, -share);
  }
  for (const s of settlements) {
    const amount = toStroops(s.amount);
    add(s.from, amount);
    add(s.to, -amount);
  }
  return net;
}

/**
 * Deterministic "who pays whom" suggestions from net balances (PRD FR-21).
 * Debtors are taken from the smallest debt to the largest and each pays the creditor currently owed the
 * most; ties break by member id. Every debtor ends at zero with as few transfers as this greedy pass gives.
 * @param {Map<string, bigint>} net
 * @returns {{ from: string, to: string, amount: bigint }[]}
 */
export function suggestTransfers(net) {
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const debtors = [...net].filter(([, v]) => v < 0n).map(([id, v]) => ({ id, left: -v }));
  const creditors = [...net].filter(([, v]) => v > 0n).map(([id, v]) => ({ id, left: v }));
  debtors.sort((a, b) => (a.left === b.left ? byId(a, b) : a.left < b.left ? -1 : 1));

  const transfers = [];
  for (const debtor of debtors) {
    while (debtor.left > 0n) {
      creditors.sort((a, b) => (a.left === b.left ? byId(a, b) : a.left > b.left ? -1 : 1));
      const creditor = creditors[0];
      if (!creditor || creditor.left === 0n) throw new Error('Balances do not sum to zero');
      const amount = debtor.left < creditor.left ? debtor.left : creditor.left;
      transfers.push({ from: debtor.id, to: creditor.id, amount });
      debtor.left -= amount;
      creditor.left -= amount;
    }
  }
  return transfers;
}
