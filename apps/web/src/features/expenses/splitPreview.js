// Live previews for the expense form. Display and early feedback only: the API validates again.

import { fromStroops, validateAmount } from '@shared/money.js';
import { checkExactSplit, splitEqual } from '@shared/splits.js';

const dec = (stroops) => fromStroops(stroops, { minDecimals: 2 });

/**
 * Keeps only what can become a valid amount while typing: digits, one dot, at most 7 decimals.
 * @param {string} raw
 */
export function cleanAmountInput(raw) {
  const normalized = raw.replace(',', '.').replace(/[^\d.]/g, '');
  const [whole, ...rest] = normalized.split('.');
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join('').slice(0, 7)}`;
}

/**
 * Equal shares, or null while the amount is not valid or nobody is selected.
 * @param {string} amount
 * @param {string[]} participantIds
 * @param {string} payerId
 * @returns {{ memberId: string, amount: string }[] | null}
 */
export function equalPreview(amount, participantIds, payerId) {
  const check = validateAmount(amount);
  if (!check.ok || participantIds.length === 0) return null;
  return [...splitEqual(check.stroops, participantIds, payerId)].map(([memberId, v]) => ({ memberId, amount: dec(v) }));
}

/**
 * Whether exact shares add up to the amount.
 * @param {string} amount
 * @param {Record<string, string>} shares memberId → typed amount ('' when left empty)
 * @returns {{ state: 'no-amount' | 'bad-share' | 'empty' | 'under' | 'over' | 'ok', sum: string, difference: string,
 *   shares: { memberId: string, amount: string }[] }}
 */
export function exactStatus(amount, shares) {
  const filled = Object.entries(shares).filter(([, v]) => v.trim() !== '');
  const parsed = [];
  for (const [memberId, v] of filled) {
    const check = validateAmount(v);
    if (!check.ok && check.code !== 'NOT_POSITIVE') return { state: 'bad-share', sum: '0.00', difference: '0.00', shares: [] };
    if (check.ok) parsed.push({ memberId, amount: v, stroops: check.stroops });
  }
  const sumStroops = parsed.reduce((t, s) => t + s.stroops, 0n);
  const total = validateAmount(amount);
  const out = parsed.map(({ memberId, amount: a }) => ({ memberId, amount: a }));
  if (!total.ok) return { state: 'no-amount', sum: dec(sumStroops), difference: '0.00', shares: out };
  if (parsed.length === 0) return { state: 'empty', sum: '0.00', difference: dec(total.stroops), shares: out };
  const result = checkExactSplit(total.stroops, parsed.map((s) => s.stroops));
  const diff = result.difference < 0n ? -result.difference : result.difference;
  const state = result.ok ? 'ok' : result.difference > 0n ? 'under' : 'over';
  return { state, sum: dec(result.sum), difference: dec(diff), shares: out };
}
