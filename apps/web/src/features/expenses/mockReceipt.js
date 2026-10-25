// Receipt scanning is mocked for now: any photo returns this result. The photo is only previewed
// locally and never leaves the browser.

/** @param {Date} now */
export function mockReceiptResult(now = new Date()) {
  return {
    merchant: 'Pingo Doce, Alfama',
    date: now.toISOString(),
    localTotal: '58.14',
    localCurrency: 'EUR',
    // 58.14 EUR ÷ 0.92 EUR per USD (mock rate) = 63.195… → 63.20 USDC.
    usdc: '63.20',
    items: [
      { nameKey: 'scan.item.produce', amount: '14.32' },
      { nameKey: 'scan.item.bakery', amount: '6.85' },
      { nameKey: 'scan.item.dairy', amount: '11.47' },
      { nameKey: 'scan.item.pantry', amount: '9.90' },
      { nameKey: 'scan.item.cleaning', amount: '15.60' },
    ],
  };
}
