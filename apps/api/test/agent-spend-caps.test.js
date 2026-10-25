import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryRepository } from '../src/repositories/index.js';
import { createLedger } from '../src/services/ledger.js';

// Issue #13: the API enforces the PRD 7.4 spend caps on agents (25 per payment, 50 per 24 hours, 200 per 30 days) before an
// agent can start a payment. Memory store, fake clock, and a fake Stellar that accepts every payment.
const HUMAN = 'GAZ2D6UYGDFFORAS3PXOEIZQLVS7ME6VYRANQJNLEELMYIAOUB4PY7NY';
const OTHER = 'GCCEP6MCOGHOWGFHMHGB3LAJVTB7ZFDPGYBUI6BFCOUH3NPVM7RZNZZX';
const AGENT = 'GDNTRR7T5BS22ULN2YHYIRPLYJWZ7EIPWG5BWBWN2TC52UVYGONEXXLC';
const human = { kind: 'human', address: HUMAN };
const agent = { kind: 'agent', address: AGENT };
const HOUR = 3600_000;
const hash = (n) => n.toString(16).padStart(64, '0');

/** Two groups. In each, the human paid 1000 for the human and the agent, so the agent owes the human 500 in each. */
async function setup(options = {}) {
  let clock = Date.parse('2026-10-25T20:00:00Z');
  const lines = [];
  const ledger = createLedger({
    repo: createMemoryRepository(),
    stellar: { asset: { code: 'USDC', issuer: OTHER }, explorerTx: (h) => h, verifyPayment: async () => ({ ok: true }) },
    now: () => new Date(clock),
    log: (line) => lines.push(line),
    ...options,
  });
  const groups = [];
  for (const name of ['Flat', 'Trip']) {
    const g = (await ledger.createGroup(human, { name })).group.id;
    await ledger.addMember(human, g, { address: AGENT, kind: 'agent' });
    const id = Object.fromEntries((await ledger.getGroup(human, g)).members.map((m) => [m.address, m.id]));
    await ledger.createExpense(human, g, { description: 'Rent', amount: '1000', paidBy: id[HUMAN], split: { type: 'equal', participants: [id[HUMAN], id[AGENT]] } });
    groups.push({ g, id });
  }
  let n = 0;
  const reserve = (amount, { who = agent, group = groups[0] } = {}) => ledger.reserveSettlement(who, group.g, { to: group.id[HUMAN], amount });
  const pay = async (amount, opts) => {
    const { intent } = await reserve(amount, opts);
    await ledger.settle(opts?.who ?? agent, (opts?.group ?? groups[0]).g, { intentId: intent.id, txHash: hash((n += 1)) });
  };
  const code = (p) => p.then((r) => r.intent?.status ?? 'ok', (e) => e.code);
  return { ledger, groups, reserve, pay, code, lines, tick: (ms) => (clock += ms) };
}

test('per payment: an agent may reserve 25 USDC but not 25.01', async () => {
  const { reserve, code } = await setup();
  assert.equal(await code(reserve('25.01')), 'AGENT_CAP_PER_PAYMENT');
  assert.equal(await code(reserve('25')), 'reserved', 'the refused reservation did not stay open');
});

test('per 24 hours: two payments of 25, then nothing more until a day has passed', async () => {
  const { pay, reserve, code, tick } = await setup();
  await pay('25');
  tick(HOUR);
  await pay('25');
  assert.equal(await code(reserve('0.01')), 'AGENT_CAP_PER_DAY');
  tick(23 * HOUR);
  assert.equal(await code(reserve('25')), 'reserved');
});

test('per 30 days: 200 in total, even when every day stays under 50', async () => {
  const { pay, reserve, code, tick } = await setup();
  for (let day = 0; day < 4; day += 1) {
    await pay('25');
    await pay('25');
    tick(25 * HOUR);
  }
  assert.equal(await code(reserve('1')), 'AGENT_CAP_PER_MONTH');
});

test('caps count spending in every group of the agent', async () => {
  const { pay, reserve, code, groups } = await setup();
  await pay('25', { group: groups[0] });
  await pay('25', { group: groups[1] });
  assert.equal(await code(reserve('1', { group: groups[0] })), 'AGENT_CAP_PER_DAY');
});

test('two reservations at once in different groups cannot add up past the daily cap', async () => {
  const { pay, reserve, code, groups } = await setup();
  await pay('25', { group: groups[0] });
  const results = await Promise.all([code(reserve('20', { group: groups[0] })), code(reserve('20', { group: groups[1] }))]);
  // 25 + 20 + 20 = 65 > 50. Each sees the other, so at most one survives.
  assert.ok(results.filter((r) => r === 'reserved').length <= 1, results.join(', '));
  assert.ok(results.includes('AGENT_CAP_PER_DAY'));
});

test('the MCP dry run is capped too', async () => {
  const { ledger, groups } = await setup();
  const [{ g, id }] = groups;
  await assert.rejects(ledger.settle(agent, g, { to: id[HUMAN], amount: '30' }, { dryRun: true }), { code: 'AGENT_CAP_PER_PAYMENT', status: 403 });
  assert.equal((await ledger.settle(agent, g, { to: id[HUMAN], amount: '25' }, { dryRun: true })).intent.amount, '25.00');
});

test('humans are not capped', async () => {
  const { ledger, groups, code } = await setup();
  const [{ g, id }] = groups;
  // The agent pays 2000 for both, so the human now owes the agent 500.
  await ledger.createExpense(agent, g, { description: 'Deposit', amount: '2000', paidBy: id[AGENT], split: { type: 'equal', participants: [id[HUMAN], id[AGENT]] } });
  assert.equal(await code(ledger.reserveSettlement(human, g, { to: id[AGENT], amount: '300' })), 'reserved');
});

test('a denial is logged with the agent, the group, the amount and the rule, and names no secret', async () => {
  const { reserve, lines, groups } = await setup();
  await reserve('30').catch(() => {});
  const denied = lines.filter((l) => l.msg === 'agent_spend_denied');
  assert.equal(denied.length, 1);
  assert.deepEqual(
    { agent: denied[0].agent, groupId: denied[0].groupId, amount: denied[0].amount, code: denied[0].code, limit: denied[0].limit },
    { agent: AGENT, groupId: groups[0].g, amount: '30.00', code: 'AGENT_CAP_PER_PAYMENT', limit: '25.00' },
  );
  assert.doesNotMatch(JSON.stringify(denied), /S[A-Z2-7]{55}/);
});

test('an agent can only pay members of its own groups', async () => {
  const { ledger, groups } = await setup();
  const outsiderGroup = (await ledger.createGroup({ kind: 'human', address: OTHER }, { name: 'Elsewhere' })).group.id;
  const otherMember = (await ledger.getGroup({ kind: 'human', address: OTHER }, outsiderGroup)).members[0].id;
  await assert.rejects(ledger.reserveSettlement(agent, groups[0].g, { to: otherMember, amount: '1' }), { code: 'VALIDATION' });
  await assert.rejects(ledger.reserveSettlement(agent, outsiderGroup, { to: otherMember, amount: '1' }), { code: 'NOT_FOUND' });
});

test('owner caps passed to the ledger replace the defaults', async () => {
  const { reserve, code } = await setup({ agentCaps: { perPayment: '5', perDay: '10', perMonth: '20' } });
  assert.equal(await code(reserve('5.01')), 'AGENT_CAP_PER_PAYMENT');
  assert.equal(await code(reserve('5')), 'reserved');
});
