import { describe, expect, it } from 'vitest';
import { toStroops } from '@shared/money.js';
import { buildBuckets, compact, niceTicks, paidByMember, PERIOD_LENGTH, shiftBucket, startOfBucket, totalsOf } from './buckets.js';

// Local-time dates, so the tests hold in any time zone.
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
const NOW = new Date(2026, 9, 26, 15); // Monday 26 Oct 2026

describe('startOfBucket', () => {
  it('goes back to midnight, to Monday, or to the 1st', () => {
    expect(startOfBucket(NOW, 'day')).toEqual(new Date(2026, 9, 26));
    expect(startOfBucket(new Date(2026, 9, 25, 23), 'week')).toEqual(new Date(2026, 9, 19)); // Sunday belongs to the week of Monday 19
    expect(startOfBucket(NOW, 'week')).toEqual(new Date(2026, 9, 26));
    expect(startOfBucket(new Date(2026, 9, 31), 'month')).toEqual(new Date(2026, 9, 1));
  });

  it('shifts across month and year ends', () => {
    expect(shiftBucket(new Date(2026, 0, 1), 'month', -1)).toEqual(new Date(2025, 11, 1));
    expect(shiftBucket(new Date(2026, 9, 26), 'day', -26)).toEqual(new Date(2026, 8, 30));
  });
});

describe('buildBuckets', () => {
  const expenses = [
    { amount: '30.00', createdAt: at(2026, 10, 26), paidBy: 'a', shares: [{ memberId: 'a', amount: '10.00' }, { memberId: 'me', amount: '20.00' }] },
    { amount: '12.50', createdAt: at(2026, 10, 26, 9), paidBy: 'b', shares: [{ memberId: 'me', amount: '12.50' }] },
    { amount: '8.00', createdAt: at(2026, 10, 24), paidBy: 'a', shares: [{ memberId: 'a', amount: '8.00' }] },
    { amount: '99.00', createdAt: at(2025, 1, 5), paidBy: 'a', shares: [] },
  ];

  it('makes one bucket per slot, oldest first, ending today', () => {
    for (const period of Object.keys(PERIOD_LENGTH)) {
      const buckets = buildBuckets(expenses, period, NOW, 'me');
      expect(buckets).toHaveLength(PERIOD_LENGTH[period]);
      expect(buckets.at(-1).start).toEqual(startOfBucket(NOW, period));
    }
  });

  it('adds up days exactly, with my share apart, and leaves out what is outside the range', () => {
    const days = buildBuckets(expenses, 'day', NOW, 'me');
    expect(days.at(-1)).toMatchObject({ total: toStroops('42.50'), mine: toStroops('32.50'), count: 2 });
    expect(days.at(-3)).toMatchObject({ total: toStroops('8.00'), mine: 0n, count: 1 });
    expect(totalsOf(days)).toEqual({ total: toStroops('50.50'), mine: toStroops('32.50'), count: 3 });
  });

  it('puts Saturday and Monday in different weeks', () => {
    const weeks = buildBuckets(expenses, 'week', NOW, 'me');
    expect(weeks.at(-1).total).toBe(toStroops('42.50'));
    expect(weeks.at(-2).total).toBe(toStroops('8.00'));
  });

  it('is all zeros with no expenses', () => {
    expect(totalsOf(buildBuckets([], 'month', NOW, 'me'))).toEqual({ total: 0n, mine: 0n, count: 0 });
  });

  it('ranks who paid inside the range', () => {
    expect(paidByMember(expenses, buildBuckets(expenses, 'day', NOW, 'me'))).toEqual([
      { memberId: 'a', total: toStroops('38.00') },
      { memberId: 'b', total: toStroops('12.50') },
    ]);
  });
});

describe('axis helpers', () => {
  it('picks round ticks that hold the biggest column', () => {
    expect(niceTicks(42.5)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(1)).toEqual([0, 0.5, 1, 1.5]);
    expect(niceTicks(1200)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(0)).toEqual([0, 1, 2, 3]);
    for (const max of [0.3, 7, 99, 480, 15000]) expect(niceTicks(max).at(-1)).toBeGreaterThanOrEqual(max);
  });

  it('shortens thousands', () => {
    expect([0.5, 120, 1000, 1200, 15000].map(compact)).toEqual(['0.5', '120', '1K', '1.2K', '15K']);
  });
});
