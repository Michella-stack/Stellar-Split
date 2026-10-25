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
      { name: 'Fruit and vegetables', amount: '14.32' },
      { name: 'Bread and pastries', amount: '6.85' },
      { name: 'Dairy and eggs', amount: '11.47' },
      { name: 'Pasta, rice, tins', amount: '9.90' },
      { name: 'Cleaning products', amount: '15.60' },
    ],
    warnings: [],
  };
}
