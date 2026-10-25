import { describe, expect, it } from 'vitest';
import { afterEach, beforeEach } from 'vitest';
import { RATES_URL, estimate, getRates, loadLiveRates, parseLiveRates, resetRates, subscribeRates } from './rates.js';

describe('estimate', () => {
  it('uses the fixed mock table', () => {
    expect(getRates()).toMatchObject({ base: 'USD', source: 'fixed', rates: { EUR: '0.92', MXN: '18.5', COP: '4000' } });
  });

  it.each([
    ['364.60', 'EUR', '€335'], // 335.432
    ['364.60', 'MXN', 'MXN 6,745'], // 6745.1
    ['427.80', 'COP', 'COP 1,711,200'],
    ['-364.60', 'EUR', '€335'],
    ['0.50', 'EUR', '€0'], // 0.46 rounds down
    ['0.55', 'EUR', '€1'], // 0.506 rounds up
  ])('%s USDC in %s ≈ %s', (usdc, currency, expected) => {
    expect(estimate(usdc, currency)).toBe(expected);
  });

  it('returns null for a currency without a rate', () => {
    expect(estimate('10', 'JPY')).toBeNull();
  });

  it('skips USD, since USDC already reads as dollars', () => {
    expect(estimate('36.00', 'USD')).toBeNull();
  });
});


const live = {
  result: 'success',
  time_last_update_utc: 'Sun, 25 Oct 2026 00:02:31 +0000',
  rates: { USD: 1, EUR: 0.892628, MXN: 18.682584, COP: 3180.084041, BRL: 5.044304, GBP: 0.74768, JPY: 150 },
};
const okResponse = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const memoryStorage = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map };
};

describe('parseLiveRates', () => {
  it('keeps only the currencies the app offers, with at most 7 decimals', () => {
    expect(parseLiveRates(live)).toEqual({
      rates: { USD: '1', EUR: '0.892628', MXN: '18.682584', COP: '3180.084041', BRL: '5.044304', GBP: '0.74768' },
      updatedAt: '2026-10-25T00:02:31.000Z',
    });
  });

  it.each([
    ['an error answer', { result: 'error', 'error-type': 'quota-reached' }],
    ['a missing currency', { ...live, rates: { ...live.rates, COP: undefined } }],
    ['a rate far from the fixed table (a unit error)', { ...live, rates: { ...live.rates, EUR: 92 } }],
    ['a zero rate', { ...live, rates: { ...live.rates, MXN: 0 } }],
    ['a string rate', { ...live, rates: { ...live.rates, GBP: '0.74' } }],
    ['nothing', null],
  ])('rejects %s', (_, payload) => {
    expect(parseLiveRates(payload)).toBeNull();
  });
});

describe('loadLiveRates', () => {
  beforeEach(resetRates);
  afterEach(resetRates);

  it('switches to live rates, notifies subscribers and caches them', async () => {
    const storage = memoryStorage();
    let notified = 0;
    const stop = subscribeRates(() => notified++);
    const fetchImpl = (url) => {
      expect(url).toBe(RATES_URL);
      return okResponse(live);
    };
    await loadLiveRates({ fetchImpl, storage, now: () => 1_000 });
    stop();
    expect(notified).toBe(1);
    expect(getRates()).toMatchObject({ source: 'live', rates: { COP: '3180.084041' } });
    expect(estimate('427.80', 'COP')).toBe('COP 1,360,440');
    expect(storage.map.size).toBe(1);
  });

  it('uses a fresh cache without calling the network, and ignores a stale one', async () => {
    const storage = memoryStorage();
    await loadLiveRates({ fetchImpl: () => okResponse(live), storage, now: () => 1_000 });
    resetRates();
    const boom = () => {
      throw new Error('network should not be used');
    };
    await loadLiveRates({ fetchImpl: boom, storage, now: () => 1_000 + 3600_000 });
    expect(getRates().source).toBe('live');
    resetRates();
    let calls = 0;
    await loadLiveRates({ fetchImpl: () => (calls++, okResponse(live)), storage, now: () => 1_000 + 7 * 3600_000 });
    expect(calls).toBe(1);
  });

  it.each([
    ['the network fails', () => Promise.reject(new Error('offline'))],
    ['the API answers an error status', () => Promise.resolve({ ok: false })],
    ['the answer is not JSON', () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('bad json')) })],
    ['the answer is odd', () => okResponse({ result: 'success', rates: { EUR: 9 } })],
  ])('keeps the fixed sample rates when %s', async (_, fetchImpl) => {
    await loadLiveRates({ fetchImpl, storage: memoryStorage() });
    expect(getRates()).toMatchObject({ source: 'fixed', rates: { EUR: '0.92' } });
  });
});
