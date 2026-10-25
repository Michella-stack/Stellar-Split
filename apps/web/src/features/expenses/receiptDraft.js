// What the scan screen does with a draft from the receipt reader: the text it shows and the form it fills.

/** @typedef {{ merchant: string | null, date: string | null, currency: string | null, total: string, usdc: string | null, items: { name: string, amount: string }[], warnings: string[] }} ReceiptDraft */

const WARNING_TEXT = Object.freeze({
  ITEMS_DO_NOT_ADD_UP: 'The items do not add up to the total. Tax or a tip may be missing, so check the total.',
  NO_CURRENCY: 'We could not tell the currency. Check the total.',
});

/** @param {ReceiptDraft} draft */
export function warningMessages(draft) {
  return draft.warnings.map((code) => WARNING_TEXT[code]).filter(Boolean);
}

/**
 * The expense form fields for a draft. A ticket in USD fills the amount (USDC reads as dollars). In any other currency the
 * amount is left empty on purpose: no exchange rate is guessed, so the person types the USDC amount.
 * @param {ReceiptDraft} draft
 */
export function draftToPrefill(draft) {
  const description = (draft.merchant ?? '').split(',')[0].trim().slice(0, 80) || 'Receipt';
  const hint = draft.usdc ? null : `The receipt total is ${[draft.currency, draft.total].filter(Boolean).join(' ')}. Enter the amount in USDC.`;
  return { amount: draft.usdc ?? '', description, hint, source: 'scan' };
}
