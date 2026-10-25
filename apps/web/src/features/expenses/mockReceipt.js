// Sample receipt reading, used when the receipt reader cannot be reached and in mock mode. It has the shape of the draft that
// POST /v1/groups/:id/receipts/scan returns, and the screen always labels it as a sample. The photo is not read in mock mode.

/** @param {Date} now */
export function mockReceiptDraft(now = new Date()) {
  return {
    merchant: 'Pingo Doce, Alfama',
    date: now.toISOString().slice(0, 10),
    currency: 'EUR',
    total: '58.14',
    // 58.14 EUR ÷ 0.92 EUR per USD (mock rate) = 63.195… → 63.20 USDC. A real reading leaves this null for any currency but USD.
    usdc: '63.20',
    items: [
      { nameKey: 'scan.item.produce', amount: '14.32' },
      { nameKey: 'scan.item.bakery', amount: '6.85' },
      { nameKey: 'scan.item.dairy', amount: '11.47' },
      { nameKey: 'scan.item.pantry', amount: '9.90' },
      { nameKey: 'scan.item.cleaning', amount: '15.60' },
    ],
    warnings: [],
  };
}
