// Groups a group's expenses into days, weeks (Monday to Sunday) or months in the viewer's local time, for the spend summary.
// Money stays in stroops (bigint); only the chart geometry uses numbers.

import { toStroops } from '@shared/money.js';

/** How many buckets each period shows, ending with the one that holds `now`. */
export const PERIOD_LENGTH = { day: 14, week: 12, month: 12 };

/** @param {Date} date @param {'day' | 'week' | 'month'} period */
export function startOfBucket(date, period) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (period === 'month') d.setDate(1);
  return d;
}

/** @param {Date} start @param {'day' | 'week' | 'month'} period @param {number} [steps] */
export function shiftBucket(start, period, steps = 1) {
  const d = new Date(start);
  if (period === 'day') d.setDate(d.getDate() + steps);
  if (period === 'week') d.setDate(d.getDate() + 7 * steps);
  if (period === 'month') d.setMonth(d.getMonth() + steps);
  return d;
}

/**
 * One bucket per slot of the period, oldest first, including empty ones so the time axis is continuous.
 * `total` is everything spent in the bucket; `mine` is the viewer's share of it.
 * @param {{ amount: string, createdAt: string, shares?: { memberId: string, amount: string }[] }[]} expenses
 * @param {'day' | 'week' | 'month'} period
 * @param {Date} now
 * @param {string | null} meId
 * @returns {{ start: Date, end: Date, total: bigint, mine: bigint, count: number }[]}
 */
export function buildBuckets(expenses, period, now, meId) {
  const last = startOfBucket(now, period);
  const buckets = Array.from({ length: PERIOD_LENGTH[period] }, (_, i) => {
    const start = shiftBucket(last, period, i - (PERIOD_LENGTH[period] - 1));
    return { start, end: shiftBucket(start, period), total: 0n, mine: 0n, count: 0 };
  });
  for (const expense of expenses) {
    const at = new Date(expense.createdAt);
    const bucket = buckets.find((b) => at >= b.start && at < b.end);
    if (!bucket) continue;
    bucket.total += toStroops(expense.amount);
    bucket.count += 1;
    const share = expense.shares?.find((s) => s.memberId === meId);
    if (share) bucket.mine += toStroops(share.amount);
  }
  return buckets;
}

/**
 * What each member paid inside the shown range, biggest first. Members who paid nothing are left out.
 * @param {{ amount: string, createdAt: string, paidBy: string }[]} expenses
 * @param {{ start: Date, end: Date }[]} buckets the range, as returned by buildBuckets
 */
export function paidByMember(expenses, buckets) {
  const from = buckets[0].start;
  const to = buckets.at(-1).end;
  const totals = new Map();
  for (const expense of expenses) {
    const at = new Date(expense.createdAt);
    if (at < from || at >= to) continue;
    totals.set(expense.paidBy, (totals.get(expense.paidBy) ?? 0n) + toStroops(expense.amount));
  }
  return [...totals].map(([memberId, total]) => ({ memberId, total })).sort((a, b) => (a.total === b.total ? 0 : a.total < b.total ? 1 : -1));
}

/** Sums over a range of buckets. @param {{ total: bigint, mine: bigint, count: number }[]} buckets */
export function totalsOf(buckets) {
  return buckets.reduce((sum, b) => ({ total: sum.total + b.total, mine: sum.mine + b.mine, count: sum.count + b.count }), { total: 0n, mine: 0n, count: 0 });
}

/**
 * Round tick values for a column chart: 0 and three steps of 1, 2 or 5 times a power of ten, enough to hold `max`.
 * @param {number} max the biggest column, in whole units (not stroops)
 * @returns {number[]}
 */
export function niceTicks(max) {
  if (!(max > 0)) return [0, 1, 2, 3];
  const raw = max / 3;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw);
  return [0, 1, 2, 3].map((i) => Math.round(i * step * 1e6) / 1e6);
}

/** 0, 0.5, 120, 1.2K, 15K. @param {number} n */
export function compact(n) {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
}
