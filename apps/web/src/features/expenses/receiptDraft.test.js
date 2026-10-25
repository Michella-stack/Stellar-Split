import { describe, expect, it } from 'vitest';
import { mockReceiptDraft } from './mockReceipt.js';
import { draftToPrefill, warningMessages } from './receiptDraft.js';

const draft = (over = {}) => ({ merchant: 'Pingo Doce, Alfama', date: '2026-10-24', currency: 'EUR', total: '58.14', usdc: null, items: [], warnings: [], ...over });

describe('draftToPrefill', () => {
  it('fills the amount for a USD ticket and names the expense after the merchant', () => {
    expect(draftToPrefill(draft({ currency: 'USD', usdc: '58.14' }))).toEqual({ amount: '58.14', description: 'Pingo Doce', hint: null, source: 'scan' });
  });

  it('leaves the amount empty in any other currency and says what the receipt total was', () => {
    const prefill = draftToPrefill(draft());
    expect(prefill.amount).toBe('');
    expect(prefill.hint).toBe('The receipt total is EUR 58.14. Enter the amount in USDC.');
    expect(prefill.source).toBe('scan');
  });

  it('copes with a missing merchant or currency, and keeps the description within the form limit', () => {
    expect(draftToPrefill(draft({ merchant: null })).description).toBe('Receipt');
    expect(draftToPrefill(draft({ merchant: ', Lisbon' })).description).toBe('Receipt');
    expect(draftToPrefill(draft({ currency: null })).hint).toBe('The receipt total is 58.14. Enter the amount in USDC.');
    expect(draftToPrefill(draft({ merchant: 'x'.repeat(200) })).description).toHaveLength(80);
  });
});

describe('warningMessages', () => {
  it('turns warning codes into sentences and ignores codes it does not know', () => {
    expect(warningMessages(draft({ warnings: ['ITEMS_DO_NOT_ADD_UP', 'NO_CURRENCY', 'SOMETHING_NEW'] }))).toHaveLength(2);
    expect(warningMessages(draft())).toEqual([]);
  });
});

describe('the sample result', () => {
  it('has the shape of a real draft, and its items add up to its total', () => {
    const sample = mockReceiptDraft(new Date('2026-10-25T12:00:00Z'));
    expect(Object.keys(sample).sort()).toEqual(['currency', 'date', 'items', 'merchant', 'total', 'usdc', 'warnings']);
    expect(sample.date).toBe('2026-10-25');
    const cents = sample.items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
    expect(cents).toBe(Math.round(Number(sample.total) * 100));
  });
});
