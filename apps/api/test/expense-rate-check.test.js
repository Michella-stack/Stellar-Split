import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createAuth, encodeAddress } from '../src/auth/index.js';
import { createMemoryRepository } from '../src/repositories/index.js';
import { createLedger } from '../src/services/ledger.js';
import { createStellar, TESTNET_PASSPHRASE } from '../src/stellar/index.js';
import { createApp } from '../src/server.js';
import { createRates, parseRates } from '../src/rates/index.js';

const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const EURC_ISSUER = 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFV4B22YNX7SW5GCAQPVKV';
const sha256 = (d) => createHash('sha256').update(d).digest();

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const address = encodeAddress(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
  return { address, signMessage: (m) => sign(null, sha256(`Stellar Signed Message:\n${m}`), privateKey).toString('base64') };
}

const payload = { result: 'success', rates: { USD: 1, EUR: 0.92, MXN: 18.5, COP: 4000, BRL: 5.4, GBP: 0.78 } };
const answer = (body = payload, status = 200) => async () => new Response(JSON.stringify(body), { status });

const alice = wallet();
const bob = wallet();
const carol = wallet();
const tokens = {};
const logs = [];
let market = createRates({ fetchImpl: answer() });
let base;
let server;

before(async () => {
  const repo = createMemoryRepository();
  const stellar = createStellar({ horizonUrl: 'https://horizon.test', usdcIssuer: USDC_ISSUER, eurcIssuer: EURC_ISSUER, fetchImpl: async () => new Response(JSON.stringify({ network_passphrase: TESTNET_PASSPHRASE }), { status: 200 }) });
  const auth = createAuth({ secret: 'test-secret-at-least-32-characters-long', repo });
  server = createApp({ auth, ledger: createLedger({ repo, stellar, appUrl: 'https://app.test', rates: { check: (input) => market.check(input) }, log: (l) => logs.push(l) }), log: () => {} });
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
const post = (g, original) => call('POST', `/v1/groups/${g.id}/expenses`, tokens.alice, { description: 'Tacos', original, paidBy: g.alice, split: { type: 'equal', participants: [g.alice, g.bob] } });

test('parseRates accepts a good answer and refuses one in other units or with a currency missing', () => {
  assert.deepEqual(parseRates(payload), { USD: '1', EUR: '0.92', MXN: '18.5', COP: '4000', BRL: '5.4', GBP: '0.78' });
  assert.equal(parseRates({ ...payload, result: 'error' }), null);
  assert.equal(parseRates({ ...payload, rates: { ...payload.rates, MXN: 185 } }), null, 'ten times too big');
  assert.equal(parseRates({ ...payload, rates: { ...payload.rates, MXN: undefined } }), null);
  assert.equal(parseRates(null), null);
});

test('a rate near the market passes, one far from it is refused with the market rate in the answer', async () => {
  market = createRates({ fetchImpl: answer() });
  const g = await newGroup();
  assert.equal((await post(g, { amount: '370', currency: 'MXN', rate: '18.5' })).status, 201);
  assert.equal((await post(g, { amount: '370', currency: 'MXN', rate: '19.8' })).status, 201, 'a card margin of about 7% is fine');
  const off = await post(g, { amount: '370', currency: 'MXN', rate: '185' });
  assert.equal(off.status, 422);
  assert.equal(off.body.error.code, 'RATE_OFF_MARKET');
  assert.deepEqual(off.body.error.details, { currency: 'MXN', groupCurrency: 'USD', rate: '185', expected: '18.5', tolerancePercent: 10 });
  assert.equal((await post(g, { amount: '370', currency: 'MXN', rate: '1.85' })).status, 422, 'a decimal point in the wrong place is the usual mistake');
});

test('the rate is compared to the group currency, so a euro group expects dollars per euro', async () => {
  market = createRates({ fetchImpl: answer() });
  const g = await newGroup('EURC');
  const good = await post(g, { amount: '10', currency: 'USD', rate: '1.0869565' });
  assert.equal(good.status, 201);
  const bad = await post(g, { amount: '10', currency: 'USD', rate: '0.92' });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.details.expected, '1.0869565');
  assert.equal(bad.body.error.details.groupCurrency, 'EUR');
});

test('when the rates source is down the expense is saved and the log says it was not checked', async () => {
  for (const fetchImpl of [answer(payload, 503), async () => { throw new Error('offline'); }, answer({ result: 'success', rates: {} })]) {
    market = createRates({ fetchImpl });
    logs.length = 0;
    const g = await newGroup();
    assert.equal((await post(g, { amount: '370', currency: 'MXN', rate: '185' })).status, 201);
    assert.ok(logs.some((l) => l.msg === 'rate_not_checked'));
  }
});

test('an expense in the group currency never touches the rates source', async () => {
  let calls = 0;
  market = createRates({ fetchImpl: async () => (calls += 1, new Response(JSON.stringify(payload))) });
  const g = await newGroup();
  const r = await call('POST', `/v1/groups/${g.id}/expenses`, tokens.alice, { description: 'x', amount: '5.00', paidBy: g.alice, split: { type: 'equal', participants: [g.alice, g.bob] } });
  assert.equal(r.status, 201);
  assert.equal(calls, 0);
});

test('rates are fetched once for many expenses, again after the ttl, and old ones are used while the source is down', async () => {
  let clock = 0;
  let calls = 0;
  let down = false;
  const fetchImpl = async () => {
    calls += 1;
    if (down) throw new Error('offline');
    return new Response(JSON.stringify(payload));
  };
  const rates = createRates({ fetchImpl, ttlMs: 1000, staleMs: 5000, now: () => clock });
  const input = { currency: 'MXN', groupCurrency: 'USD', rate: '18.5' };
  await Promise.all([rates.check(input), rates.check(input), rates.check(input)]);
  assert.equal(calls, 1, 'three at once make one request');
  await rates.check(input);
  assert.equal(calls, 1, 'inside the ttl');
  clock = 1500;
  await rates.check(input);
  assert.equal(calls, 2, 'after the ttl');
  down = true;
  clock = 3000;
  assert.deepEqual(await rates.check(input), { checked: true, ok: true, expected: '18.5' }, 'stale rates still count');
  clock = 9000;
  assert.deepEqual(await rates.check(input), { checked: false }, 'too old to trust');
});
