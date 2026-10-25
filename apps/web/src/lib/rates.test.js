import { describe, expect, it } from 'vitest';
import { estimate, getRates } from './rates.js';

describe('estimate', () => {
  it('uses the fixed mock table', () => {
    expect(getRates()).toMatchObject({ base: 'USD', source: 'mock', rates: { EUR: '0.92', MXN: '18.5', COP: '4000' } });
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
