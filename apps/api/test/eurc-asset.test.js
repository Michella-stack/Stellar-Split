import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryRepository } from '../src/repositories/index.js';
import { createLedger } from '../src/services/ledger.js';
import { createStellar, TESTNET_PASSPHRASE } from '../src/stellar/index.js';
import { loadConfig } from '../src/main.js';

// #98: a group settles in USDC (the default) or EURC, one asset per group. Horizon is faked, so the asset check is what is under test.
const A = 'GAZ2D6UYGDFFORAS3PXOEIZQLVS7ME6VYRANQJNLEELMYIAOUB4PY7NY';
const B = 'GCCEP6MCOGHOWGFHMHGB3LAJVTB7ZFDPGYBUI6BFCOUH3NPVM7RZNZZX';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const EURC_ISSUER = 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO';
const human = (address) => ({ kind: 'human', address });
const TX = 'ab'.repeat(32);

/** A Horizon that knows one transaction: B pays A `amount` of `paid` and carries the memo and time bounds the test sets. */
function horizonWith(tx) {
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  return async (url) => {
    const path = new URL(url).pathname;
    if (path === '/') return json({ network_passphrase: TESTNET_PASSPHRASE });
    if (path === `/transactions/${TX}`) {
      return json({ successful: true, created_at: '2026-10-25T17:01:00Z', memo_type: 'hash', memo: Buffer.from(tx.memoHash, 'hex').toString('base64'), preconditions: { timebounds: { max_time: String(tx.maxTime) } } });
    }
    if (path === `/transactions/${TX}/operations`) {
      return json({ _embedded: { records: [{ type: 'payment', from: B, to: A, amount: tx.amount, asset_type: 'credit_alphanum4', asset_code: tx.paid.code, asset_issuer: tx.paid.issuer }] } });
    }
    return new Response('{}', { status: 404 });
  };
}

async function setup({ eurc = true, asset } = {}) {
  const clock = Date.parse('2026-10-25T17:00:00Z');
  let tx = null;
  const stellar = createStellar({ horizonUrl: 'https://horizon.test', usdcIssuer: USDC_ISSUER, eurcIssuer: eurc ? EURC_ISSUER : null, fetchImpl: (url) => { return horizonWith(tx)(url); } });
  const ledger = createLedger({ repo: createMemoryRepository(), stellar, now: () => new Date(clock) });
  const created = await ledger.createGroup(human(A), { name: 'Piso', ...(asset ? { asset } : {}) });
  const g = created.group.id;
  await ledger.addMember(human(A), g, { address: B });
  const id = Object.fromEntries((await ledger.getGroup(human(A), g)).members.map((m) => [m.address, m.id]));
  await ledger.createExpense(human(A), g, { description: 'Rent', amount: '20', paidBy: id[A], split: { type: 'equal', participants: [id[A], id[B]] } });
  return { ledger, g, id, created, setTx: (t) => (tx = t) };
}

test('a group settles in USDC unless it is created with another asset', async () => {
  const { created } = await setup();
  assert.deepEqual(created.group.asset, { code: 'USDC', issuer: USDC_ISSUER });
});

test('a EURC group reports EURC and reserves EURC intents', async () => {
  const { created, ledger, g, id } = await setup({ asset: 'EURC' });
  assert.deepEqual(created.group.asset, { code: 'EURC', issuer: EURC_ISSUER });
  const { intent } = await ledger.reserveSettlement(human(B), g, { to: id[A], amount: '10' });
  assert.deepEqual(intent.asset, { code: 'EURC', issuer: EURC_ISSUER });
  const dry = await ledger.settle(human(B), g, { to: id[A], amount: '10' }, { dryRun: true });
  assert.equal(dry.intent.asset.code, 'EURC');
});

test('a EURC payment settles a EURC group, and a USDC payment does not', async () => {
  const { ledger, g, id, setTx } = await setup({ asset: 'EURC' });
  const { intent } = await ledger.reserveSettlement(human(B), g, { to: id[A], amount: '10' });
  const base = { memoHash: intent.memo.value, maxTime: Math.floor(Date.parse(intent.expiresAt) / 1000), amount: '10.0000000' };

  setTx({ ...base, paid: { code: 'USDC', issuer: USDC_ISSUER } });
  await assert.rejects(() => ledger.settle(human(B), g, { intentId: intent.id, txHash: TX }), { code: 'PAYMENT_MISMATCH', message: /No EURC payment/ });

  setTx({ ...base, paid: { code: 'EURC', issuer: EURC_ISSUER } });
  const done = await ledger.settle(human(B), g, { intentId: intent.id, txHash: TX });
  assert.equal(done.settlement.txHash, TX);
});

test('a EURC payment with the wrong issuer is refused', async () => {
  const { ledger, g, id, setTx } = await setup({ asset: 'EURC' });
  const { intent } = await ledger.reserveSettlement(human(B), g, { to: id[A], amount: '10' });
  setTx({ memoHash: intent.memo.value, maxTime: Math.floor(Date.parse(intent.expiresAt) / 1000), amount: '10.0000000', paid: { code: 'EURC', issuer: USDC_ISSUER } });
  await assert.rejects(() => ledger.settle(human(B), g, { intentId: intent.id, txHash: TX }), { code: 'PAYMENT_MISMATCH' });
});

test('USDC groups still verify USDC payments', async () => {
  const { ledger, g, id, setTx } = await setup();
  const { intent } = await ledger.reserveSettlement(human(B), g, { to: id[A], amount: '10' });
  setTx({ memoHash: intent.memo.value, maxTime: Math.floor(Date.parse(intent.expiresAt) / 1000), amount: '10.0000000', paid: { code: 'USDC', issuer: USDC_ISSUER } });
  assert.equal((await ledger.settle(human(B), g, { intentId: intent.id, txHash: TX })).settlement.txHash, TX);
});

test('EURC is refused when no issuer is configured, and so is an unknown asset', async () => {
  const off = createLedger({ repo: createMemoryRepository(), stellar: createStellar({ horizonUrl: 'https://horizon.test', usdcIssuer: USDC_ISSUER }) });
  await assert.rejects(() => off.createGroup(human(A), { name: 'Piso', asset: 'EURC' }), { code: 'ASSET_NOT_SUPPORTED' });
  await assert.rejects(() => off.createGroup(human(A), { name: 'Piso', asset: 'XYZ' }), { code: 'ASSET_NOT_SUPPORTED' });
  await assert.rejects(() => off.createGroup(human(A), { name: 'Piso', asset: 42 }), { code: 'ASSET_NOT_SUPPORTED' });
});

test('EURC_ISSUER is optional and must be a G address when set', () => {
  const env = { USDC_ISSUER, ALLOW_MEMORY_STORE: 'true', SESSION_SECRET: 'x'.repeat(40) };
  assert.equal(loadConfig(env).eurcIssuer, null);
  assert.equal(loadConfig({ ...env, EURC_ISSUER }).eurcIssuer, EURC_ISSUER);
  assert.throws(() => loadConfig({ ...env, EURC_ISSUER: 'nope' }), /EURC_ISSUER must be a G address/);
});

test('the group list names each group’s asset and totals euros apart from dollars', async () => {
  const { ledger, id } = await setup({ asset: 'EURC' });
  await ledger.createGroup(human(A), { name: 'Dollars' });
  const list = await ledger.listGroups(human(B));
  assert.deepEqual(list.groups.map((x) => x.asset), ['EURC']);
  assert.deepEqual(list.totals, { youOwe: '0.00', youAreOwed: '0.00' });
  assert.deepEqual(list.otherTotals, [{ asset: 'EURC', youOwe: '10.00', youAreOwed: '0.00' }]);
  assert.ok(id[A]);
});
