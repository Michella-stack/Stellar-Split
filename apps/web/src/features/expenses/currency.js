// Entering an expense in another currency (ADR 0011): which currencies, which rate, and the amount in the group's asset.

import { convertShares, convertToStroops, crossRate, currencyOfAsset, EXPENSE_CURRENCIES } from '@shared/currency.js';
import { fromStroops, validateAmount } from '@shared/money.js';

export { currencyOfAsset, EXPENSE_CURRENCIES };

/** A symbol in front of the amount box, where there is a short one. Others (pesos) rely on the code shown beside the box. */
export const CURRENCY_SYMBOL = Object.freeze({ USD: '$', EUR: '€', GBP: '£', BRL: 'R$' });

/**
 * The rate in use for an expense: what the person typed when it is valid, otherwise the cross rate from the rates in use
 * (quoted per US dollar). Null when the expense is in the group's own currency or no rate is known.
 * @param {{ currency: string, groupCurrency: string, ratesPerUsd: Readonly<Record<string, string>>, typed?: string }} input
 * @returns {{ rate: string, custom: boolean } | null}
 */
export function rateFor({ currency, groupCurrency, ratesPerUsd, typed = '' }) {
  if (currency === groupCurrency) return null;
  const custom = validateAmount(typed);
  if (typed && custom.ok) return { rate: typed, custom: true };
  const from = ratesPerUsd[currency];
  const to = ratesPerUsd[groupCurrency];
  return from && to ? { rate: crossRate(from, to), custom: false } : null;
}

/** Whether a typed rate is acceptable to the API (positive, 0.001 to 1,000,000). @param {string} typed */
export function rateProblem(typed) {
  const check = validateAmount(typed);
  if (!check.ok) return true;
  return check.stroops < 10_000n || check.stroops > 10_000_000_000_000n;
}

/** The amount in the group's asset, as a decimal string, or '' while the amount or rate is not valid. */
export function convertedAmount(amount, rate) {
  if (!rate || !validateAmount(amount).ok) return '';
  const stroops = convertToStroops(amount, rate);
  return stroops > 0n ? fromStroops(stroops) : '';
}

/** Exact shares typed in the expense's currency, converted to the group's asset so that they add up to the converted total. */
export function convertExactShares(shares, rate) {
  return convertShares(shares, rate);
}
