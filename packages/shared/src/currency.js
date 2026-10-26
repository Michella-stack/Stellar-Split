// Entering an expense in another currency (ADR 0011). Balances stay in the group's asset: an expense in pesos is converted
// once, when it is saved, at a rate that is stored with it, so nothing is ever repriced afterwards.
// A rate is "units of the original currency per 1 unit of the group's currency" (18.5 for MXN in a USDC group), a decimal
// string with at most 7 decimals. All the arithmetic is integer (stroops); never a JavaScript number.

import { AmountError, fromStroops, STROOPS_PER_UNIT, toStroops } from './money.js';

/** Currencies an expense can be entered in. USD and EUR are the group's own currency for a USDC and an EURC group. */
export const EXPENSE_CURRENCIES = Object.freeze(['USD', 'EUR', 'MXN', 'COP', 'BRL', 'GBP']);

/** The fiat currency a group asset stands for. @param {'USDC' | 'EURC' | string} assetCode */
export function currencyOfAsset(assetCode) {
  return assetCode === 'EURC' ? 'EUR' : 'USD';
}

/** @param {string} rate @returns {bigint} the rate in stroops, which must be positive */
function rateStroops(rate) {
  const r = toStroops(rate);
  if (r <= 0n) throw new AmountError('NOT_POSITIVE', 'A rate must be positive');
  return r;
}

/**
 * The amount in the group's asset, in stroops, rounded half up.
 * @param {string} original decimal string in the original currency
 * @param {string} rate original units per 1 group unit
 * @returns {bigint}
 */
export function convertToStroops(original, rate) {
  const r = rateStroops(rate);
  return (2n * toStroops(original) * STROOPS_PER_UNIT + r) / (2n * r);
}

/**
 * Converts exact shares one by one so that they add up to exactly what the whole amount converts to: whatever rounding
 * leaves over goes, one stroop each, to the shares that lost the most. Shares are returned in the order given.
 * @param {{ memberId: string, amount: string }[]} shares in the original currency
 * @param {string} rate
 * @returns {{ memberId: string, amount: string }[]} in the group's asset
 */
export function convertShares(shares, rate) {
  const r = rateStroops(rate);
  const originals = shares.map((s) => toStroops(s.amount));
  const total = (2n * originals.reduce((a, b) => a + b, 0n) * STROOPS_PER_UNIT + r) / (2n * r);
  const parts = originals.map((o, index) => ({ index, floor: (o * STROOPS_PER_UNIT) / r, lost: (o * STROOPS_PER_UNIT) % r }));
  let left = total - parts.reduce((a, p) => a + p.floor, 0n);
  for (const p of [...parts].sort((a, b) => (a.lost === b.lost ? a.index - b.index : a.lost > b.lost ? -1 : 1))) {
    if (left <= 0n) break;
    p.floor += 1n;
    left -= 1n;
  }
  return shares.map((s, i) => ({ memberId: s.memberId, amount: fromStroops(parts[i].floor) }));
}

/**
 * The rate between two currencies from rates quoted per US dollar ("18.5" MXN per USD, "0.92" EUR per USD).
 * @param {string} perUsdOfOriginal units of the original currency per 1 USD
 * @param {string} perUsdOfGroup units of the group's currency per 1 USD
 * @returns {string} original units per 1 group unit, rounded half up to 7 decimals
 */
export function crossRate(perUsdOfOriginal, perUsdOfGroup) {
  const g = rateStroops(perUsdOfGroup);
  const value = (2n * rateStroops(perUsdOfOriginal) * STROOPS_PER_UNIT + g) / (2n * g);
  return fromStroops(value, { minDecimals: 0 });
}
