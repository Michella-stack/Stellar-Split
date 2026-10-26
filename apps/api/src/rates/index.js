// Market rates, only to check the rate of an expense entered in another currency (ADR 0011). Nothing here sets a rate or
// moves a balance: the rate that was sent is the one that is stored, and this says whether it is close to the market.
//
// Source: open.er-api.com, daily rates per US dollar, no key (the same one the web app shows estimates from). They are kept
// in memory for a few hours. If the source cannot be reached or answers something odd, the check is skipped ("not checked"),
// never failed: a saved expense must not depend on someone else's website being up.

import { crossRate, EXPENSE_CURRENCIES, toStroops } from '../../../../packages/shared/src/index.js';

export const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
/** How far a rate may be from the market one, in percent. Wide enough for a bank's or card's own margin. */
export const TOLERANCE_PERCENT = 10n;

// Units per US dollar. Only used to refuse a response that is plainly in other units, as the web app does.
const SANE_PER_USD = Object.freeze({ EUR: 0.92, MXN: 18.5, COP: 4000, BRL: 5.4, GBP: 0.78 });

const rateString = (n) => n.toFixed(7).replace(/0+$/, '').replace(/\.$/, '');

/** @returns {Record<string, string> | null} units per US dollar for every currency an expense can use, or null */
export function parseRates(payload) {
  if (!payload || payload.result !== 'success' || typeof payload.rates !== 'object' || payload.rates === null) return null;
  const perUsd = { USD: '1' };
  for (const code of EXPENSE_CURRENCIES) {
    if (code === 'USD') continue;
    const value = payload.rates[code];
    const sane = SANE_PER_USD[code];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < sane / 4 || value > sane * 4) return null;
    perUsd[code] = rateString(value);
  }
  return perUsd;
}

/**
 * @param {{ fetchImpl?: typeof fetch, url?: string, ttlMs?: number, staleMs?: number, timeoutMs?: number, now?: () => number,
 *   log?: (line: object) => void }} [options]
 *   ttlMs: how long fetched rates are used without asking again. staleMs: how long old rates still count when asking fails.
 */
export function createRates({ fetchImpl = globalThis.fetch, url = RATES_URL, ttlMs = 6 * 3600_000, staleMs = 48 * 3600_000, timeoutMs = 3000, now = Date.now, log = () => {} } = {}) {
  let cache = null; // { perUsd, fetchedAt }
  let pending = null; // one request at a time, however many expenses arrive together

  async function refresh() {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      const perUsd = response.ok ? parseRates(await response.json()) : null;
      if (perUsd) cache = { perUsd, fetchedAt: now() };
      else log({ level: 'warn', msg: 'rates_unusable', status: response.status });
    } catch (err) {
      log({ level: 'warn', msg: 'rates_unreachable', error: err?.name ?? 'Error' });
    } finally {
      pending = null;
    }
  }

  async function load() {
    if (!cache || now() - cache.fetchedAt >= ttlMs) {
      pending ??= refresh();
      await pending;
    }
    return cache && now() - cache.fetchedAt < staleMs ? cache : null;
  }

  return {
    /**
     * Whether `rate` (units of `currency` per 1 unit of `groupCurrency`) is within TOLERANCE_PERCENT of the market rate.
     * @returns {Promise<{ checked: false } | { checked: true, ok: boolean, expected: string }>}
     */
    async check({ currency, groupCurrency, rate }) {
      const known = await load();
      if (!known?.perUsd[currency] || !known.perUsd[groupCurrency]) return { checked: false };
      const expected = crossRate(known.perUsd[currency], known.perUsd[groupCurrency]);
      const market = toStroops(expected);
      const given = toStroops(rate);
      const gap = given > market ? given - market : market - given;
      return { checked: true, ok: gap * 100n <= market * TOLERANCE_PERCENT, expected };
    },
  };
}
