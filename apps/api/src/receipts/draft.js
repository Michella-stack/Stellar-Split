// Turns what the model returned into a draft the person reviews. Everything the model says is untrusted text: it can be wrong,
// it can be cut, and a photo can try to steer it. So the draft only ever carries values that pass the same rules as an expense.

import { containsSecretKey, fromStroops, sum, toStroops, validateAmount } from '../../../../packages/shared/src/index.js';
import { ApiError } from '../services/ledger.js';

const MAX_TOTAL = toStroops('1000000');
const MAX_ITEMS = 50;
const dec = (stroops) => fromStroops(stroops, { minDecimals: 2 });

const cleanText = (value, max) => {
  if (typeof value !== 'string') return null;
  // Collapse whitespace and drop control characters, then cut to the limit.
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return text || null;
};

function cleanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

/**
 * @param {unknown} raw the JSON the model returned
 * @returns {{ merchant: string | null, date: string | null, currency: string | null, total: string, usdc: string | null,
 *   items: { name: string, amount: string }[], warnings: string[] }}
 * @throws {ApiError} NOT_A_RECEIPT, SCAN_UNREADABLE or SECRET_KEY_REJECTED
 */
export function toDraft(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(422, 'SCAN_UNREADABLE', 'The receipt could not be read');
  // Also catches a seed written with JSON escapes, because this looks at the parsed values.
  if (containsSecretKey(JSON.stringify(raw))) throw new ApiError(400, 'SECRET_KEY_REJECTED', 'Never send a Stellar secret key');
  if (raw.is_receipt !== true) throw new ApiError(422, 'NOT_A_RECEIPT', 'This does not look like a receipt');

  const total = typeof raw.total === 'string' ? validateAmount(raw.total.trim(), { max: MAX_TOTAL }) : { ok: false };
  if (!total.ok) throw new ApiError(422, 'SCAN_UNREADABLE', 'The total on the receipt could not be read');

  const items = (Array.isArray(raw.items) ? raw.items : [])
    .slice(0, MAX_ITEMS)
    .map((item) => ({ name: cleanText(item?.name, 80), amount: typeof item?.amount === 'string' ? validateAmount(item.amount.trim(), { max: MAX_TOTAL }) : { ok: false } }))
    .filter((item) => item.name && item.amount.ok)
    .map((item) => ({ name: item.name, stroops: item.amount.stroops }));

  const currency = typeof raw.currency === 'string' && /^[A-Z]{3}$/.test(raw.currency.trim()) ? raw.currency.trim() : null;
  const warnings = [];
  if (!currency) warnings.push('NO_CURRENCY');
  if (items.length > 0 && sum(items.map((i) => i.stroops)) !== total.stroops) warnings.push('ITEMS_DO_NOT_ADD_UP');

  return {
    merchant: cleanText(raw.merchant, 80),
    date: cleanDate(raw.date),
    currency,
    total: dec(total.stroops),
    // USDC reads as dollars, so a ticket in USD counts 1:1. For any other currency the person types the amount: no rate is guessed.
    usdc: currency === 'USD' ? dec(total.stroops) : null,
    items: items.map((i) => ({ name: i.name, amount: dec(i.stroops) })),
    warnings,
  };
}
