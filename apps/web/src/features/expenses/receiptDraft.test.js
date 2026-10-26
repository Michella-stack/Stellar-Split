import { describe, expect, it } from 'vitest';
import { mockReceiptDraft } from './mockReceipt.js';
import { amountInAsset, draftToPrefill, warningMessages } from './receiptDraft.js';

const draft = (over = {}) => ({ merchant: 'Pingo Doce, Alfama', date: '2026-10-24', currency: 'EUR', total: '58.14', usdc: null, items: [], warnings: [], ...over });

describe('draftToPrefill', () => {
  it('fills the amount for a USD ticket and names the expense after the merchant', () => {
    expect(draftToPrefill(draft({ currency: 'USD', usdc: '58.14' }))).toEqual({ amount: '58.14', description: 'Pingo Doce', hint: null, source: 'scan' });
  });

  it('fills a ticket in another known currency in that currency, to be converted by the form', () => {
    const prefill = draftToPrefill(draft());
    expect(prefill).toMatchObject({ amount: '58.14', currency: 'EUR', source: 'scan' });
    expect(prefill.hint).toBe('The receipt is in EUR. It will be converted to USDC at the rate shown; you can change it.');
  });

  it('leaves the amount empty only for a currency the app cannot convert, and says what the total was', () => {
    const prefill = draftToPrefill(draft({ currency: 'JPY' }));
    expect(prefill.amount).toBe('');
    expect(prefill.currency).toBeUndefined();
    expect(prefill.hint).toBe('The receipt total is JPY 58.14. Enter the amount in USDC.');
  });

  it('copes with a missing merchant or currency, and keeps the description within the form limit', () => {
    expect(draftToPrefill(draft({ merchant: null })).description).toBe('Receipt');
    expect(draftToPrefill(draft({ merchant: ', Lisbon' })).description).toBe('Receipt');
    expect(draftToPrefill(draft({ currency: null })).hint).toBe('The receipt total is 58.14. Enter the amount in USDC.');
    expect(draftToPrefill(draft({ merchant: 'x'.repeat(200) })).description).toHaveLength(80);
  });
});

describe('a EURC group', () => {
  it('fills the amount for a ticket in euros, with no conversion', () => {
    expect(draftToPrefill(draft(), 'EURC')).toEqual({ amount: '58.14', description: 'Pingo Doce', hint: null, source: 'scan' });
  });

  it('converts a ticket in dollars or pounds, and asks by hand only for an unknown currency', () => {
    for (const currency of ['USD', 'GBP']) {
      const prefill = draftToPrefill(draft({ currency, usdc: currency === 'USD' ? '58.14' : null }), 'EURC');
      expect(prefill, currency).toMatchObject({ amount: '58.14', currency });
      expect(prefill.hint).toBe(`The receipt is in ${currency}. It will be converted to EURC at the rate shown; you can change it.`);
    }
    const unknown = draftToPrefill(draft({ currency: null }), 'EURC');
    expect(unknown.amount).toBe('');
    expect(unknown.hint).toBe('The receipt total is 58.14. Enter the amount in EURC.');
  });

  it('converts a ticket in euros for a USDC group instead of leaving it empty', () => {
    expect(draftToPrefill(draft(), 'USDC')).toMatchObject({ amount: '58.14', currency: 'EUR' });
    expect(draftToPrefill(draft())).toMatchObject({ amount: '58.14', currency: 'EUR' });
  });
});

describe('amountInAsset', () => {
  it('matches the ticket currency to the asset and never converts', () => {
    expect(amountInAsset(draft({ currency: 'USD', usdc: '58.14' }), 'USDC')).toBe('58.14');
    expect(amountInAsset(draft({ currency: 'USD', usdc: '58.14' }), 'EURC')).toBeNull();
    expect(amountInAsset(draft(), 'EURC')).toBe('58.14');
    expect(amountInAsset(draft(), 'USDC')).toBeNull();
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
