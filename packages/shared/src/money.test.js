import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AmountError, fromStroops, toStroops, validateAmount } from './money.js';

describe('toStroops', () => {
  it('parses whole and fractional amounts', () => {
    assert.equal(toStroops('364.60'), 3_646_000_000n);
    assert.equal(toStroops('1600'), 16_000_000_000n);
    assert.equal(toStroops('0.0000001'), 1n);
    assert.equal(toStroops('0'), 0n);
  });

  it('keeps precision far beyond Number.MAX_SAFE_INTEGER', () => {
    assert.equal(toStroops('922337203685.4775807'), 9_223_372_036_854_775_807n);
  });

  for (const bad of ['', ' 1', '1 ', '-1', '+1', '1e3', '1,5', '.5', '5.', '0x10', 'NaN', '１']) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      assert.throws(() => toStroops(bad), (e) => e instanceof AmountError && e.code === 'INVALID_FORMAT');
    });
  }

  it('rejects more than 7 decimals', () => {
    assert.throws(() => toStroops('1.00000001'), (e) => e.code === 'TOO_MANY_DECIMALS');
  });

  it('rejects non-strings, including numbers', () => {
    assert.throws(() => toStroops(/** @type {any} */ (1.5)), (e) => e.code === 'INVALID_FORMAT');
  });
});

describe('fromStroops', () => {
  it('formats with 7 decimals by default', () => {
    assert.equal(fromStroops(3_646_000_000n), '364.6000000');
    assert.equal(fromStroops(1n), '0.0000001');
  });

  it('trims trailing zeros down to minDecimals', () => {
    assert.equal(fromStroops(3_646_000_000n, { minDecimals: 2 }), '364.60');
    assert.equal(fromStroops(16_000_000_000n, { minDecimals: 0 }), '1600');
    assert.equal(fromStroops(1n, { minDecimals: 2 }), '0.0000001');
  });

  it('keeps the sign', () => {
    assert.equal(fromStroops(-3_646_000_000n, { minDecimals: 2 }), '-364.60');
  });

  it('round-trips', () => {
    for (const v of ['0.0000001', '12.3456789', '1172.2', '0']) {
      assert.equal(fromStroops(toStroops(v), { minDecimals: 0 }), v);
    }
  });
});

describe('validateAmount', () => {
  it('accepts a positive amount', () => {
    assert.deepEqual(validateAmount('364.60'), { ok: true, stroops: 3_646_000_000n });
  });

  it('rejects zero', () => {
    assert.deepEqual(validateAmount('0.00'), { ok: false, code: 'NOT_POSITIVE' });
  });

  it('rejects more than 7 decimals', () => {
    assert.deepEqual(validateAmount('1.12345678'), { ok: false, code: 'TOO_MANY_DECIMALS' });
  });

  it('rejects amounts over the limit (balance or open debt)', () => {
    const balance = toStroops('100');
    assert.deepEqual(validateAmount('100.0000001', { max: balance }), { ok: false, code: 'EXCEEDS_LIMIT' });
    assert.equal(validateAmount('100', { max: balance }).ok, true);
  });
});
