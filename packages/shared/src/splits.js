// Expense splits. All values in stroops.

import { sum } from './money.js';

/**
 * Splits an amount equally. The remainder (at most n-1 stroops) goes to the payer when the payer
 * participates (PRD FR-11), otherwise to the first participant in the given order.
 * @param {bigint} total
 * @param {string[]} participantIds in a stable order
 * @param {string} payerId
 * @returns {Map<string, bigint>} share per participant, in participant order
 */
export function splitEqual(total, participantIds, payerId) {
  if (participantIds.length === 0) throw new Error('An expense needs at least one participant');
  if (new Set(participantIds).size !== participantIds.length) throw new Error('Duplicate participant');
  const count = BigInt(participantIds.length);
  const base = total / count;
  const remainder = total - base * count;
  const remainderTo = participantIds.includes(payerId) ? payerId : participantIds[0];
  return new Map(participantIds.map((id) => [id, id === remainderTo ? base + remainder : base]));
}

/**
 * Checks that exact shares add up to the total.
 * @param {bigint} total
 * @param {bigint[]} shares
 * @returns {{ ok: boolean, sum: bigint, difference: bigint }} difference = total − sum (positive: still to assign)
 */
export function checkExactSplit(total, shares) {
  const assigned = sum(shares);
  return { ok: assigned === total && shares.every((s) => s >= 0n), sum: assigned, difference: total - assigned };
}
