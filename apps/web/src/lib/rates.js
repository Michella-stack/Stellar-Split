// Home-currency estimates. Display only: always shown with "≈" and the word "estimate".
// The table is fixed mock data; replace getRates() with a real rates API without touching callers.

import { toStroops } from '@shared/money.js';

/** Units of each currency per 1 USD. Mock values, not market data. */
const MOCK_RATES_PER_USD = Object.freeze({
  USD: '1',
  EUR: '0.92',
  MXN: '18.5',
  COP: '4000',
  BRL: '5.40',
  GBP: '0.78',
});

export const HOME_CURRENCIES = Object.freeze(Object.keys(MOCK_RATES_PER_USD));

const SYMBOL_PREFIX = { USD: '$', EUR: '€', GBP: '£', BRL: 'R$' };

/**
 * The rate table to use. One function so a real source can replace the mock.
 * @returns {{ base: 'USD', rates: Readonly<Record<string, string>>, source: 'mock' }}
 */
export function getRates() {
  return { base: 'USD', rates: MOCK_RATES_PER_USD, source: 'mock' };
}

/**
 * Converts a USDC amount (treated as USD) to a rounded whole-unit estimate in another currency.
 * @param {string} usdc decimal string; the sign is ignored
 * @param {string} currency ISO code, e.g. "EUR"
 * @returns {string | null} e.g. "€335", "MXN 6,745", or null when there is no rate. Also null for USD:
 *   USDC already reads as dollars, so an estimate would only repeat the amount.
 */
export function estimate(usdc, currency) {
  if (currency === 'USD') return null;
  const rate = getRates().rates[currency];
  if (!rate) return null;
  const scale = 10n ** 14n; // 7 decimals on the amount × 7 decimals on the rate
  const product = toStroops(usdc.replace(/^-/, '')) * toStroops(rate);
  const units = (product + scale / 2n) / scale;
  const grouped = units.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return currency in SYMBOL_PREFIX ? `${SYMBOL_PREFIX[currency]}${grouped}` : `${currency} ${grouped}`;
}
