// Home-currency estimates. Display only: always shown with "≈" and the word "estimate".
//
// Rates come from a free public API (open.er-api.com, daily rates, no key), cached for a few hours. If it cannot be
// reached or answers something odd, a fixed sample table is used and the UI says so. Money maths never uses these.

import { toStroops } from '@shared/money.js';
import { currentSeparators } from '../i18n/state.js';
import { groupThousands } from './format.js';

/** Units of each currency per 1 USD. Sample values, not market data: used until live rates arrive, or if they never do. */
const FIXED_RATES_PER_USD = Object.freeze({
  USD: '1',
  EUR: '0.92',
  MXN: '18.5',
  COP: '4000',
  BRL: '5.40',
  GBP: '0.78',
});

export const HOME_CURRENCIES = Object.freeze(Object.keys(FIXED_RATES_PER_USD));

export const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
export const RATES_ATTRIBUTION_URL = 'https://www.exchangerate-api.com';
const CACHE_KEY = 'stellar-split.rates';
const CACHE_TTL_MS = 6 * 3600_000;
const FETCH_TIMEOUT_MS = 6000;

const SYMBOL_PREFIX = { USD: '$', EUR: '€', GBP: '£', BRL: 'R$' };

/**
 * @typedef {{ base: 'USD', rates: Readonly<Record<string, string>>, source: 'fixed' | 'live', updatedAt: string | null }} RatesSnapshot
 */

/** @type {RatesSnapshot} */
let snapshot = { base: 'USD', rates: FIXED_RATES_PER_USD, source: 'fixed', updatedAt: null };
const listeners = new Set();

/** The rates in use now. The object only changes when the rates do, so it is safe for useSyncExternalStore. */
export function getRates() {
  return snapshot;
}

/** @param {() => void} listener @returns {() => void} unsubscribe */
export function subscribeRates(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @param {RatesSnapshot} next */
function setSnapshot(next) {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Puts the fixed table back. For tests. */
export function resetRates() {
  setSnapshot({ base: 'USD', rates: FIXED_RATES_PER_USD, source: 'fixed', updatedAt: null });
}

/** @param {number} n a positive rate @returns {string} up to 7 decimals, no trailing zeros */
function rateString(n) {
  return n.toFixed(7).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Reads a response of the rates API. Rejects anything that is not a plain success with a sane rate for every currency
 * the app offers: a rate far from the fixed table is more likely a unit error than a market move.
 * @param {any} payload
 * @returns {{ rates: Record<string, string>, updatedAt: string } | null}
 */
export function parseLiveRates(payload) {
  if (!payload || payload.result !== 'success' || typeof payload.rates !== 'object' || payload.rates === null) return null;
  const rates = {};
  for (const code of HOME_CURRENCIES) {
    if (code === 'USD') {
      rates.USD = '1';
      continue;
    }
    const value = payload.rates[code];
    const fixed = Number(FIXED_RATES_PER_USD[code]);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < fixed / 4 || value > fixed * 4) return null;
    rates[code] = rateString(value);
  }
  const updated = Date.parse(payload.time_last_update_utc);
  return { rates, updatedAt: Number.isFinite(updated) ? new Date(updated).toISOString() : new Date().toISOString() };
}

/**
 * Loads live rates, from the cache when it is fresh, otherwise from the API. Never throws: on any failure the rates in
 * use stay as they are (the fixed table by default).
 * @param {{ fetchImpl?: typeof fetch, storage?: Storage | null, now?: () => number }} [options]
 * @returns {Promise<RatesSnapshot>}
 */
export async function loadLiveRates({ fetchImpl = globalThis.fetch, storage = safeStorage(), now = Date.now } = {}) {
  try {
    const cached = JSON.parse(storage?.getItem(CACHE_KEY) ?? 'null');
    if (cached && now() - cached.fetchedAt < CACHE_TTL_MS && parseLiveRates({ result: 'success', rates: cached.raw, time_last_update_utc: cached.updatedAt })) {
      const parsed = parseLiveRates({ result: 'success', rates: cached.raw, time_last_update_utc: cached.updatedAt });
      setSnapshot({ base: 'USD', rates: parsed.rates, source: 'live', updatedAt: parsed.updatedAt });
      return snapshot;
    }
  } catch {
    // A broken cache is ignored.
  }
  try {
    const response = await fetchImpl(RATES_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return snapshot;
    const payload = await response.json();
    const parsed = parseLiveRates(payload);
    if (!parsed) return snapshot;
    setSnapshot({ base: 'USD', rates: parsed.rates, source: 'live', updatedAt: parsed.updatedAt });
    try {
      storage?.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: now(), raw: payload.rates, updatedAt: payload.time_last_update_utc }));
    } catch {
      // Storage full or blocked: the rates still work for this page view.
    }
  } catch {
    // Offline, blocked or slow: keep what is in use.
  }
  return snapshot;
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Converts a USDC amount (treated as USD) to a rounded whole-unit estimate in another currency.
 * @param {string} usdc decimal string; the sign is ignored
 * @param {string} currency ISO code, e.g. "EUR"
 * @param {Readonly<Record<string, string>>} [rates] defaults to the rates in use
 * @returns {string | null} e.g. "€335", "MXN 6,745", or null when there is no rate. Also null for USD:
 *   USDC already reads as dollars, so an estimate would only repeat the amount.
 */
export function estimate(usdc, currency, rates = snapshot.rates) {
  if (currency === 'USD') return null;
  const rate = rates[currency];
  if (!rate) return null;
  const scale = 10n ** 14n; // 7 decimals on the amount × 7 decimals on the rate
  const product = toStroops(usdc.replace(/^-/, '')) * toStroops(rate);
  const units = (product + scale / 2n) / scale;
  const grouped = groupThousands(units.toString(), currentSeparators().group);
  return currency in SYMBOL_PREFIX ? `${SYMBOL_PREFIX[currency]}${grouped}` : `${currency} ${grouped}`;
}
