import { describe, expect, it } from 'vitest';
import { toStroops } from '@shared/money.js';
import { buildBuckets } from './buckets.js';
import { convertDisplay, pool, rangeTotals } from './overall.js';

const RATES = { USD: '1', EUR: '0.92', MXN: '18.5' };
const NOW = new Date(2026, 9, 26, 15);
const at = (d, h = 12) => new Date(2026, 9, d, h).toISOString();

const lisbon = {
  groupId: 'g1',
  groupName: 'Lisbon',
  currency: 'USD',
  me: 'm1',
  expenses: [
    { amount: '30.00', createdAt: at(26), paidBy: 'm1', shares: [{ memberId: 'm1', amount: '10.00' }, { memberId: 'm2', amount: '20.00' }] },
    { amount: '12.00', createdAt: at(25), paidBy: 'm2', shares: [{ memberId: 'm1', amount: '6.00' }, { memberId: 'm2', amount: '6.00' }] },
  ],
};
const berlin = {
  groupId: 'g2',
  groupName: 'Berlin',
  currency: 'EUR',
  me: 'x9',
  expenses: [{ amount: '92.00', createdAt: at(24), paidBy: 'x9', shares: [{ memberId: 'x9', amount: '46.00' }, { memberId: 'y1', amount: '46.00' }] }],
};

describe('convertDisplay', () => {
  it('goes through the dollar and rounds half up', () => {
    expect(convertDisplay(toStroops('92'), 'EUR', 'USD', RATES)).toBe(toStroops('100'));
    expect(convertDisplay(toStroops('10'), 'USD', 'MXN', RATES)).toBe(toStroops('185'));
    expect(convertDisplay(toStroops('18.5'), 'MXN', 'EUR', RATES)).toBe(toStroops('0.92'));
    expect(convertDisplay(5n, 'USD', 'USD', RATES)).toBe(5n);
  });
});

describe('pool', () => {
  it('puts every group in the home currency and says when it converted something', () => {
    const { expenses, converted } = pool([lisbon, berlin], 'USD', RATES);
    expect(converted).toBe(true);
    expect(expenses.map((e) => e.amount)).toEqual(['30.00', '12.00', '100.00']);
    expect(pool([lisbon], 'USD', RATES).converted).toBe(false);
    expect(pool([{ ...berlin, expenses: [] }], 'USD', RATES).converted).toBe(false);
  });

  it('turns my member in each group into the same "me", whatever its id', () => {
    const { expenses } = pool([lisbon, berlin], 'USD', RATES);
    expect(expenses.map((e) => e.paidBy)).toEqual(['me', 'm2', 'me']);
    expect(expenses.map((e) => e.shares)).toEqual([[{ memberId: 'me', amount: '10.00' }], [{ memberId: 'me', amount: '6.00' }], [{ memberId: 'me', amount: '50.00' }]]);
  });

  it('leaves out my share of an expense I am not in', () => {
    const { expenses } = pool([{ ...lisbon, expenses: [{ amount: '9', createdAt: at(26), paidBy: 'm2', shares: [{ memberId: 'm2', amount: '9' }] }] }], 'USD', RATES);
    expect(expenses[0].shares).toEqual([]);
  });
});

describe('rangeTotals', () => {
  const { expenses } = pool([lisbon, berlin], 'USD', RATES);
  const buckets = buildBuckets(expenses, 'day', NOW, 'me');

  it('adds up the total, my share and what I paid across groups, exactly', () => {
    const totals = rangeTotals(expenses, buckets);
    expect(totals).toMatchObject({ total: toStroops('142'), mine: toStroops('66'), paid: toStroops('130'), count: 3 });
  });

  it('gives each group its own row', () => {
    const rows = Object.fromEntries(rangeTotals(expenses, buckets).perGroup.map((r) => [r.groupId, r]));
    expect(rows.g1).toMatchObject({ total: toStroops('42'), mine: toStroops('16') });
    expect(rows.g2).toMatchObject({ total: toStroops('100'), mine: toStroops('50') });
  });

  it('ignores what is outside the range, and agrees with the buckets', () => {
    const old = [...expenses, { groupId: 'g1', createdAt: new Date(2025, 0, 5).toISOString(), amount: '999', paidBy: 'me', shares: [] }];
    const totals = rangeTotals(old, buckets);
    expect(totals.total).toBe(toStroops('142'));
    expect(buckets.reduce((s, b) => s + b.total, 0n)).toBe(totals.total);
    expect(rangeTotals([], buckets)).toEqual({ total: 0n, mine: 0n, paid: 0n, count: 0, perGroup: [] });
  });
});
