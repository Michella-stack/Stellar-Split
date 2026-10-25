// "Settle all": a person who owes several members pays them one after another. The list of who to pay travels in the
// route state, so each Paid screen can offer the next payment. Amounts are always read again from the group.

import { fromStroops, toStroops } from '@shared/money.js';

/**
 * The members to pay after `current`, in order, from a route-state queue.
 * Anything that is not a list of member ids (or a queue that does not contain `current`) gives no next payment.
 * @param {unknown} queue
 * @param {string} current member id being paid now
 * @returns {string[]}
 */
export function queueAfter(queue, current) {
  if (!Array.isArray(queue) || queue.some((id) => typeof id !== 'string')) return [];
  const at = queue.indexOf(current);
  return at === -1 ? [] : queue.slice(at + 1);
}

/**
 * What a person owes in total across the suggested transfers.
 * @param {{ to: string, amount: string }[]} owes
 * @returns {string} decimal string, 2 decimals or more
 */
export function totalOwed(owes) {
  return fromStroops(owes.reduce((sum, t) => sum + toStroops(t.amount), 0n), { minDecimals: 2 });
}
