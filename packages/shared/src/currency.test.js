import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convertShares, convertToStroops, crossRate, currencyOfAsset, EXPENSE_CURRENCIES } from './currency.js';
import { fromStroops, toStroops } from './money.js';

describe('convertToStroops', () => {
  it('divides by the rate and rounds half up', () => {
    assert.equal(fromStroops(convertToStroops('100', '18.5'), { minDecimals: 2 }), '5.4054054');
    assert.equal(fromStroops(convertToStroops('20', '0.92'), { minDecimals: 2 }), '21.7391304');
    assert.equal(convertToStroops('1', '2'), toStroops('0.5'));
    assert.equal(convertToStroops('0.0000001', '2'), 1n, 'half a stroop rounds up');
    assert.equal(convertToStroops('0.0000001', '3'), 0n);
  });

  it('does not lose precision on large amounts', () => {
    assert.equal(convertToStroops('999999999999.9999999', '1'), toStroops('999999999999.9999999'));
    assert.equal(convertToStroops('999999999999', '2'), toStroops('499999999999.5'));
  });

  it('refuses a zero, negative or malformed rate', () => {
    assert.throws(() => convertToStroops('10', '0'), { code: 'NOT_POSITIVE' });
    assert.throws(() => convertToStroops('10', '-1'), { code: 'INVALID_FORMAT' });
    assert.throws(() => convertToStroops('10', '1,5'), { code: 'INVALID_FORMAT' });
    assert.throws(() => convertToStroops('10', '1.12345678'), { code: 'TOO_MANY_DECIMALS' });
  });
});

describe('convertShares', () => {
  const sum = (shares) => shares.reduce((t, s) => t + toStroops(s.amount), 0n);

  it('adds up to exactly what the whole amount converts to', () => {
    const shares = [
      { memberId: 'a', amount: '33.33' },
      { memberId: 'b', amount: '33.33' },
      { memberId: 'c', amount: '33.34' },
    ];
    for (const rate of ['18.5', '0.92', '4347.826087', '3', '7']) {
      const converted = convertShares(shares, rate);
      assert.equal(sum(converted), convertToStroops('100', rate), `rate ${rate}`);
      assert.deepEqual(converted.map((s) => s.memberId), ['a', 'b', 'c']);
    }
  });

  it('gives a stroop back to the share that lost the most', () => {
    // 1 / 3 and 1 / 3 and 1 / 3 of 1: floors leave one stroop over for the first of equal remainders.
    const converted = convertShares([{ memberId: 'a', amount: '1' }, { memberId: 'b', amount: '1' }, { memberId: 'c', amount: '1' }], '9');
    assert.equal(sum(converted), convertToStroops('3', '9'));
  });
});

describe('crossRate', () => {
  it('turns two per-dollar quotes into one', () => {
    assert.equal(crossRate('18.5', '1'), '18.5');
    assert.equal(crossRate('18.5', '0.92'), '20.1086957');
    assert.equal(crossRate('1', '0.92'), '1.0869565');
    assert.equal(crossRate('0.92', '0.92'), '1');
  });

  it('knows which currency a group asset stands for', () => {
    assert.equal(currencyOfAsset('USDC'), 'USD');
    assert.equal(currencyOfAsset('EURC'), 'EUR');
    assert.ok(EXPENSE_CURRENCIES.includes('USD') && EXPENSE_CURRENCIES.includes('EUR'));
  });
});
