import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createAuth, encodeAddress } from '../src/auth/index.js';
import { createMemoryRepository } from '../src/repositories/index.js';
import { createLedger } from '../src/services/ledger.js';
import { createStellar, TESTNET_PASSPHRASE } from '../src/stellar/index.js';
import { createApp } from '../src/server.js';

const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const EURC_ISSUER = 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFV4B22YNX7SW5GCAQPVKV';
const sha256 = (d) => createHash('sha256').update(d).digest();

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const address = encodeAddress(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
  return { address, signMessage: (m) => sign(null, sha256(`Stellar Signed Message:\n${m}`), privateKey).toString('base64') };
}

const alice = wallet();
const bob = wallet();
const carol = wallet();
const tokens = {};
let base;
let server;

before(async () => {
  const repo = createMemoryRepository();
  const stellar = createStellar({ horizonUrl: 'https://horizon.test', usdcIssuer: USDC_ISSUER, eurcIssuer: EURC_ISSUER, fetchImpl: async () => new Response(JSON.stringify({ network_passphrase: TESTNET_PASSPHRASE }), { status: 200 }) });
  const auth = createAuth({ secret: 'test-secret-at-least-32-characters-long', repo });
  server = createApp({ auth, ledger: createLedger({ repo, stellar, appUrl: 'https://app.test' }), log: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [name, w] of Object.entries({ alice, bob, carol })) {
    const { challenge } = await (await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: w.address }) })).json();
    const res = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: w.address, challenge, signature: w.signMessage(challenge) }) });
    tokens[name] = (await res.json()).session.token;
  }
});
after(() => server.close());

async function call(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function newGroup(asset) {
  const g = await call('POST', '/v1/groups', tokens.alice, { name: 'Trip', type: 'trip', displayName: 'Alice', ...(asset ? { asset } : {}) });
  const id = g.body.group.id;
  const b = await call('POST', `/v1/groups/${id}/members`, tokens.alice, { address: bob.address, displayName: 'Bob' });
  return { id, alice: g.body.me, bob: b.body.member.id };
}

const post = (g, body) => call('POST', `/v1/groups/${g.id}/expenses`, tokens.alice, { description: 'Tacos', ...body });
const net = async (g) => Object.fromEntries((await call('GET', `/v1/groups/${g.id}`, tokens.alice)).body.balances.map((b) => [b.memberId, b.net]));

test('an expense in pesos is converted once and keeps what was typed and the rate', async () => {
  const g = await newGroup();
  const r = await post(g, { original: { amount: '370', currency: 'MXN', rate: '18.5' }, paidBy: g.alice, split: { type: 'equal', participants: [g.alice, g.bob] } });
  assert.equal(r.status, 201);
  assert.equal(r.body.expense.amount, '20.00');
  assert.deepEqual(r.body.expense.original, { amount: '370.00', currency: 'MXN', rate: '18.5' });
  assert.equal(r.body.expense.originalAmount, undefined, 'the flat columns stay inside original');
  assert.deepEqual(await net(g), { [g.alice]: '10.00', [g.bob]: '-10.00' });
  const list = await call('GET', `/v1/groups/${g.id}/expenses`, tokens.bob);
  assert.equal(list.body.expenses[0].original.currency, 'MXN');
});

test('an expense in the group currency has no original', async () => {
  const g = await newGroup();
  const r = await post(g, { amount: '12.00', paidBy: g.alice, split: { type: 'equal', participants: [g.alice, g.bob] } });
  assert.equal(r.body.expense.original, undefined);
});

test('a client that also sends amount must have converted it the same way', async () => {
  const g = await newGroup();
  const split = { type: 'equal', participants: [g.alice, g.bob] };
  const ok = await post(g, { amount: '20.00', original: { amount: '370', currency: 'MXN', rate: '18.5' }, paidBy: g.alice, split });
  assert.equal(ok.status, 201);
  const bad = await post(g, { amount: '25.00', original: { amount: '370', currency: 'MXN', rate: '18.5' }, paidBy: g.alice, split });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'AMOUNT_RATE_MISMATCH');
  assert.equal(bad.body.error.details.expected, '20.00');
});

test('exact shares in the group asset must add up to the converted amount', async () => {
  const g = await newGroup();
  const original = { amount: '100', currency: 'MXN', rate: '3' };
  const shares = (a, b) => ({ type: 'exact', shares: [{ memberId: g.alice, amount: a }, { memberId: g.bob, amount: b }] });
  assert.equal((await post(g, { original, paidBy: g.alice, split: shares('16.6666667', '16.6666666') })).status, 201);
  assert.equal((await post(g, { original, paidBy: g.alice, split: shares('10.00', '10.00') })).body.error.code, 'SPLIT_MISMATCH');
});

test('the original currency, the rate and the result are checked', async () => {
  const g = await newGroup();
  const split = { type: 'equal', participants: [g.alice, g.bob] };
  const tries = {
    'the group own currency': { amount: '10', currency: 'USD', rate: '1' },
    'an unknown currency': { amount: '10', currency: 'XYZ', rate: '2' },
    'a zero rate': { amount: '10', currency: 'MXN', rate: '0' },
    'a huge rate': { amount: '10', currency: 'MXN', rate: '99999999' },
    'a malformed rate': { amount: '10', currency: 'MXN', rate: '1,5' },
    'a zero amount': { amount: '0', currency: 'MXN', rate: '18.5' },
    'an amount that converts to nothing': { amount: '0.0000001', currency: 'MXN', rate: '18.5' },
  };
  for (const [name, original] of Object.entries(tries)) {
    const r = await post(g, { original, paidBy: g.alice, split });
    assert.equal(r.status, 400, name);
  }
  assert.equal((await post(g, { original: 'MXN', paidBy: g.alice, split })).status, 400);
  assert.equal((await net(g))[g.alice], '0.00', 'nothing was saved');
});

test('a euro group takes dollars but not euros', async () => {
  const g = await newGroup('EURC');
  const split = { type: 'equal', participants: [g.alice, g.bob] };
  const usd = await post(g, { original: { amount: '10', currency: 'USD', rate: '1.0869565' }, paidBy: g.alice, split });
  assert.equal(usd.status, 201);
  assert.equal(usd.body.expense.amount, '9.2000002');
  assert.equal((await post(g, { original: { amount: '10', currency: 'EUR', rate: '1' }, paidBy: g.alice, split })).status, 400);
});

test('the same retry key does not save the converted expense twice', async () => {
  const g = await newGroup();
  const send = () =>
    fetch(`${base}/v1/groups/${g.id}/expenses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokens.alice}`, 'content-type': 'application/json', 'idempotency-key': 'retry-key-0001' },
      body: JSON.stringify({ description: 'Tacos', original: { amount: '370', currency: 'MXN', rate: '18.5' }, paidBy: g.alice, split: { type: 'equal', participants: [g.alice, g.bob] } }),
    }).then((r) => r.json());
  const [a, b] = [await send(), await send()];
  assert.equal(a.expense.id, b.expense.id);
  assert.deepEqual(await net(g), { [g.alice]: '10.00', [g.bob]: '-10.00' });
});
