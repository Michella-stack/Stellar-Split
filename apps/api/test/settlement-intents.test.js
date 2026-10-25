import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryRepository } from '../src/repositories/index.js';
import { createLedger } from '../src/services/ledger.js';

// Review fix 2: concurrent settlements cannot overpay. The ledger runs on the memory store with a fake clock and a
// fake Stellar that accepts every payment, so only the reservation rules are under test.
const A = 'GAZ2D6UYGDFFORAS3PXOEIZQLVS7ME6VYRANQJNLEELMYIAOUB4PY7NY';
const B = 'GCCEP6MCOGHOWGFHMHGB3LAJVTB7ZFDPGYBUI6BFCOUH3NPVM7RZNZZX';
const C = 'GDNTRR7T5BS22ULN2YHYIRPLYJWZ7EIPWG5BWBWN2TC52UVYGONEXXLC';
const D = 'GBFZL2P7L6CIMJBZKA7JKXRBFPQI7H6QXMMHXV5VXH33PBMKYCLZ6B4E';
const human = (address) => ({ kind: 'human', address });
const hash = (n) => n.toString(16).padStart(64, '0');

/** Group where A and B are each owed 10, and C and D each owe 10 (A paid for D, B paid for C). */
async function setup() {
  let clock = Date.parse('2026-10-25T17:00:00Z');
  const ledger = createLedger({
    repo: createMemoryRepository(),
    stellar: { asset: { code: 'USDC', issuer: B }, explorerTx: (h) => h, verifyPayment: async () => ({ ok: true }) },
    now: () => new Date(clock),
  });
  const g = (await ledger.createGroup(human(A), { name: 'Piso' })).group.id;
  for (const address of [B, C, D]) await ledger.addMember(human(A), g, { address });
  const id = Object.fromEntries((await ledger.getGroup(human(A), g)).members.map((m) => [m.address, m.id]));
  await ledger.createExpense(human(A), g, { description: 'Rent', amount: '20', paidBy: id[A], split: { type: 'equal', participants: [id[A], id[D]] } });
  await ledger.createExpense(human(B), g, { description: 'Food', amount: '20', paidBy: id[B], split: { type: 'equal', participants: [id[B], id[C]] } });
  const reserve = (payer, to, amount = '10') => ledger.reserveSettlement(human(payer), g, { to: id[to], amount });
  const outcome = (p) => p.then((r) => r.intent.status, (e) => e.code);
  const net = async () => Object.fromEntries((await ledger.balances(human(A), g)).balances.map((b) => [b.address, b.net]));
  return { ledger, g, id, reserve, outcome, net, tick: (ms) => (clock += ms) };
}

test('the same payer twice at once: exactly one reservation wins', async () => {
  const { reserve, outcome } = await setup();
  const results = await Promise.all([outcome(reserve(D, A)), outcome(reserve(D, A))]);
  assert.deepEqual(results.sort(), ['INTENT_IN_PROGRESS', 'reserved']);
});

test('one debtor paying two creditors at once is refused (a per-debt lock would overpay here)', async () => {
  const { reserve, outcome } = await setup();
  // D owes 10 in total. Each payment alone is within what D owes and what A or B is owed.
  const results = await Promise.all([outcome(reserve(D, A)), outcome(reserve(D, B))]);
  assert.deepEqual(results.sort(), ['INTENT_IN_PROGRESS', 'reserved']);
});

test('two debtors paying one creditor at once is refused', async () => {
  const { ledger, g, reserve, outcome } = await setup();
  // A is owed 10. C and D each owe 10, so each payment alone would pass the OVERPAY check.
  const first = await reserve(D, A);
  assert.equal(await outcome(reserve(C, A)), 'INTENT_IN_PROGRESS');
  await ledger.cancelSettlement(human(D), g, first.intent.id);
  assert.equal(await outcome(reserve(C, A)), 'reserved', 'cancelling frees the creditor');
});

test('a reserved intent stops blocking once it expires', async () => {
  const { reserve, outcome, tick } = await setup();
  await reserve(D, A);
  tick(9 * 60 * 1000);
  assert.equal(await outcome(reserve(D, A)), 'INTENT_IN_PROGRESS');
  tick(2 * 60 * 1000);
  assert.equal(await outcome(reserve(D, A)), 'reserved');
});

test('an overpaying reservation is refused and does not block the next one', async () => {
  const { reserve, outcome } = await setup();
  assert.equal(await outcome(reserve(D, A, '10.01')), 'OVERPAY');
  assert.equal(await outcome(reserve(D, A)), 'reserved');
});

test('a payment for an expired intent still settles: its time bounds kept it inside the window', async () => {
  const { ledger, g, reserve, net, tick } = await setup();
  const { intent } = await reserve(D, A);
  tick(11 * 60 * 1000);
  await reserve(C, B); // runs the expiry for the group
  const r = await ledger.settle(human(D), g, { intentId: intent.id, txHash: hash(1) });
  assert.equal(r.settlement.intentId, intent.id);
  assert.equal((await net())[D], '0.00');
});

test('a payment that no longer matches the debt is kept for review, not recorded', async () => {
  const { ledger, g, id, reserve, net } = await setup();
  const { intent } = await reserve(D, A);
  // Meanwhile D pays 10 of A's costs, so D no longer owes A anything.
  await ledger.createExpense(human(D), g, { description: 'Taxi', amount: '20', paidBy: id[D], split: { type: 'equal', participants: [id[A], id[D]] } });
  await assert.rejects(ledger.settle(human(D), g, { intentId: intent.id, txHash: hash(2) }), { code: 'NEEDS_REVIEW' });
  assert.equal((await net())[D], '0.00', 'the payment is not counted');
  await assert.rejects(ledger.settle(human(D), g, { intentId: intent.id, txHash: hash(2) }), { code: 'INTENT_NOT_OPEN' });
});

test('a payment for a cancelled intent is kept for review', async () => {
  const { ledger, g, reserve } = await setup();
  const { intent } = await reserve(D, A);
  await ledger.cancelSettlement(human(D), g, intent.id);
  await assert.rejects(ledger.settle(human(D), g, { intentId: intent.id, txHash: hash(3) }), { code: 'NEEDS_REVIEW' });
});

test('only the payer can cancel, and only a reserved intent', async () => {
  const { ledger, g, reserve } = await setup();
  const { intent } = await reserve(D, A);
  await assert.rejects(ledger.cancelSettlement(human(A), g, intent.id), { code: 'INTENT_NOT_FOUND' });
  await ledger.cancelSettlement(human(D), g, intent.id);
  await assert.rejects(ledger.cancelSettlement(human(D), g, intent.id), { code: 'INTENT_NOT_OPEN' });
});
