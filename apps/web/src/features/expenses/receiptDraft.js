// What the scan screen does with a draft from the receipt reader: the text it shows and the form it fills.

import { currencyOfAsset, EXPENSE_CURRENCIES } from '@shared/currency.js';
import { tNow } from '../../i18n/index.js';

/** @typedef {{ merchant: string | null, date: string | null, currency: string | null, total: string, usdc: string | null, items: { name: string, amount: string }[], warnings: string[] }} ReceiptDraft */

// Warning codes the reader can send; each has a `scan.warn.<CODE>` translation.
const WARNING_CODES = Object.freeze(['ITEMS_DO_NOT_ADD_UP', 'NO_CURRENCY']);

/** @param {ReceiptDraft} draft */
export function warningMessages(draft) {
  return draft.warnings.filter((code) => WARNING_CODES.includes(code)).map((code) => tNow(`scan.warn.${code}`));
}

/**
 * The amount of a draft in the group's asset, or null when the ticket is in another currency. USDC reads as dollars and EURC
 * as euros, so only a ticket in the matching currency counts 1:1; no exchange rate is guessed. For USDC this is the `usdc`
 * field of the draft, which the API fills only for a ticket in USD.
 * @param {ReceiptDraft} draft
 * @param {'USDC' | 'EURC'} assetCode
 * @returns {string | null}
 */
export function amountInAsset(draft, assetCode) {
  if (assetCode === 'EURC') return draft.currency === 'EUR' ? draft.total : null;
  return draft.usdc ?? null;
}

/**
 * The expense form fields for a draft. A ticket in the group's currency fills the amount. A ticket in another currency the app
 * can convert (ADR 0011) fills the amount in that currency and selects it, so the form converts it at the rate shown. Only a
 * currency the app does not know leaves the amount empty, so the person types it in the group's asset.
 * @param {ReceiptDraft} draft
 * @param {'USDC' | 'EURC'} [assetCode]
 */
export function draftToPrefill(draft, assetCode = 'USDC') {
  const description = (draft.merchant ?? '').split(',')[0].trim().slice(0, 80) || tNow('scan.receiptFallback');
  const groupCurrency = currencyOfAsset(assetCode);
  if (draft.currency && draft.currency !== groupCurrency && EXPENSE_CURRENCIES.includes(draft.currency)) {
    const hint = tNow('scan.hintConverted', { currency: draft.currency, asset: assetCode });
    return { amount: draft.total, currency: draft.currency, description, hint, source: 'scan' };
  }
  const amount = amountInAsset(draft, assetCode);
  const hint = amount ? null : tNow('scan.hintTotal', { total: [draft.currency, draft.total].filter(Boolean).join(' '), asset: assetCode });
  return { amount: amount ?? '', description, hint, source: 'scan' };
}
