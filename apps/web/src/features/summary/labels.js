// Date labels for the spend summary, in the language in use.

import { currentLocale } from '../../i18n/state.js';

/** @param {Date} date @param {'day' | 'week' | 'month'} period @param {'axis' | 'full'} kind */
export function bucketLabel(date, period, kind) {
  const locale = currentLocale();
  const options =
    period === 'month' ? (kind === 'full' ? { month: 'long', year: 'numeric' } : { month: 'short' }) : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/** @param {{ start: Date, end: Date }} bucket @param {'day' | 'week' | 'month'} period */
export function bucketRange(bucket, period) {
  if (period !== 'week') return bucketLabel(bucket.start, period, 'full');
  const last = new Date(bucket.end);
  last.setDate(last.getDate() - 1);
  return `${bucketLabel(bucket.start, period, 'full')} – ${bucketLabel(last, period, 'full')}`;
}
