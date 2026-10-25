// What the scan screen does with a draft from the receipt reader: the text it shows and the form it fills.

import { tNow } from '../../i18n/index.js';

/** @typedef {{ merchant: string | null, date: string | null, currency: string | null, total: string, usdc: string | null, items: { name: string, amount: string }[], warnings: string[] }} ReceiptDraft */

// Warning codes the reader can send; each has a `scan.warn.<CODE>` translation.
const WARNING_CODES = Object.freeze(['ITEMS_DO_NOT_ADD_UP', 'NO_CURRENCY']);

/** @param {ReceiptDraft} draft */
export function warningMessages(draft) {
  return draft.warnings.filter((code) => WARNING_CODES.includes(code)).map((code) => tNow(`scan.warn.${code}`));
}

/**
 * The expense form fields for a draft. A ticket in USD fills the amount (USDC reads as dollars). In any other currency the
 * amount is left empty on purpose: no exchange rate is guessed, so the person types the USDC amount.
 * @param {ReceiptDraft} draft
 */
export function draftToPrefill(draft) {
  const description = (draft.merchant ?? '').split(',')[0].trim().slice(0, 80) || tNow('scan.receiptFallback');
  const hint = draft.usdc ? null : tNow('scan.hintTotal', { total: [draft.currency, draft.total].filter(Boolean).join(' ') });
  return { amount: draft.usdc ?? '', description, hint, source: 'scan' };
}
