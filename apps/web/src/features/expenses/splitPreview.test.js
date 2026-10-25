import { describe, expect, it } from 'vitest';
import { cleanAmountInput, equalPreview, exactStatus } from './splitPreview.js';

describe('cleanAmountInput', () => {
  it.each([
    ['12.50', '12.50'],
    ['12,50', '12.50'],
    ['$1 600', '1600'],
    ['1.2.3', '1.23'],
    ['0.123456789', '0.1234567'],
    ['abc', ''],
  ])('%s → %s', (raw, clean) => {
    expect(cleanAmountInput(raw)).toBe(clean);
  });
});

describe('equalPreview', () => {
  it('splits the Groceries example 4 ways', () => {
    expect(equalPreview('63.20', ['you', 'mateo', 'valentina', 'jake'], 'you')).toEqual([
      { memberId: 'you', amount: '15.80' },
      { memberId: 'mateo', amount: '15.80' },
      { memberId: 'valentina', amount: '15.80' },
      { memberId: 'jake', amount: '15.80' },
    ]);
  });

  it('returns null without a valid amount or participants', () => {
    expect(equalPreview('', ['a'], 'a')).toBeNull();
    expect(equalPreview('10', [], 'a')).toBeNull();
  });
});

describe('exactStatus', () => {
  it('is ok when shares add up', () => {
    expect(exactStatus('60', { a: '20', b: '25', c: '15' })).toMatchObject({ state: 'ok', sum: '60.00' });
  });

  it('reports what is left and what is too much', () => {
    expect(exactStatus('60', { a: '20', b: '25', c: '' })).toMatchObject({ state: 'under', difference: '15.00' });
    expect(exactStatus('60', { a: '50', b: '25' })).toMatchObject({ state: 'over', difference: '15.00' });
  });

  it('flags a share with too many decimals and waits for an amount', () => {
    expect(exactStatus('60', { a: '1.123456789' }).state).toBe('bad-share');
    expect(exactStatus('', { a: '10' }).state).toBe('no-amount');
    expect(exactStatus('10', {}).state).toBe('empty');
  });
});
