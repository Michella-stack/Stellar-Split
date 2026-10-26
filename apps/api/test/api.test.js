import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createAuth, encodeAddress, parseAgentTokens } from '../src/auth/index.js';
import { createMemoryRepository } from '../src/repositories/index.js';
import { createLedger } from '../src/services/ledger.js';
import { createStellar, TESTNET_PASSPHRASE } from '../src/stellar/index.js';
import { createApp } from '../src/server.js';

const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const sha256 = (d) => createHash('sha256').update(d).digest();

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const address = encodeAddress(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
  return { address, signMessage: (m) => sign(null, sha256(`Stellar Signed Message:\n${m}`), privateKey).toString('base64') };
}

// Fake Horizon: transactions registered in `chain` by hash.
const chain = new Map();
async function fakeHorizon(url) {
  const path = new URL(url).pathname;
  const json = (status, body) => new Response(JSON.stringify(body), { status });
  if (path === '/') return json(200, { network_passphrase: TESTNET_PASSPHRASE });
  const m = /^\/transactions\/([0-9a-f]{64})(\/operations)?$/.exec(path);
  const tx = m && chain.get(m[1]);
  if (!tx) return json(404, {});
  if (tx.delayMs) await new Promise((r) => setTimeout(r, tx.delayMs));
  if (m[2]) return json(200, { _embedded: { records: tx.ops } });
  return json(200, {
    successful: tx.successful ?? true,
    created_at: tx.createdAt ?? new Date().toISOString(),
    ...(tx.memo ? { memo_type: 'hash', memo: tx.memo } : { memo_type: 'none' }),
    ...(tx.maxTime ? { preconditions: { timebounds: { min_time: '0', max_time: tx.maxTime } } } : {}),
  });
}

const agentToken = 'agent-token-for-tests-0123456789';
const alice = wallet();
const bob = wallet();
const carol = wallet();
const agent = wallet();
let base;
let server;

before(async () => {
  const repo = createMemoryRepository();
  const stellar = createStellar({ horizonUrl: 'https://horizon.test', usdcIssuer: USDC_ISSUER, fetchImpl: fakeHorizon });
  const auth = createAuth({ secret: 'test-secret-at-least-32-characters-long', repo, agentTokens: parseAgentTokens(`${sha256(agentToken).toString('hex')}=${agent.address}`) });
  server = createApp({ auth, ledger: createLedger({ repo, stellar, appUrl: 'https://app.test' }), log: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function signIn(w) {
  const { body: c } = await call('POST', '/v1/auth/challenge', { body: { address: w.address } });
  const r = await call('POST', '/v1/auth/verify', { body: { address: w.address, challenge: c.challenge, signature: w.signMessage(c.challenge) } });
  assert.equal(r.status, 200);
  return r.body.session.token;
}

const tokens = {};
let groupId;
let ids;

test('health is public, everything else needs a session', async () => {
  assert.equal((await call('GET', '/v1/health')).status, 200);
  const r = await call('GET', '/v1/groups');
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'UNAUTHORIZED');
});

test('sign-in rejects a wrong signature, a replay, an edited challenge, a forged session and a bad address', async () => {
  const { body: c } = await call('POST', '/v1/auth/challenge', { body: { address: alice.address } });
  const forged = await call('POST', '/v1/auth/verify', { body: { address: alice.address, challenge: c.challenge, signature: bob.signMessage(c.challenge) } });
  assert.equal(forged.status, 401);
  const good = { address: alice.address, challenge: c.challenge, signature: alice.signMessage(c.challenge) };
  assert.equal((await call('POST', '/v1/auth/verify', { body: good })).status, 200);
  assert.equal((await call('POST', '/v1/auth/verify', { body: good })).status, 401, 'a signed challenge cannot be replayed');
  const bad = await call('POST', '/v1/auth/challenge', { body: { address: `${alice.address.slice(0, -1)}${alice.address.endsWith('A') ? 'B' : 'A'}` } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'INVALID_ADDRESS');
  const { body: c2 } = await call('POST', '/v1/auth/challenge', { body: { address: alice.address } });
  const forgedChallenge = c2.challenge.replace(/Expires: .*/, 'Expires: 2099-01-01T00:00:00.000Z');
  assert.equal((await call('POST', '/v1/auth/verify', { body: { address: alice.address, challenge: forgedChallenge, signature: alice.signMessage(forgedChallenge) } })).status, 401, 'an edited challenge fails its MAC');
  for (const [name, w] of Object.entries({ alice, bob, carol })) tokens[name] = await signIn(w);
  const [body, tag] = tokens.carol.split('.');
  const asAlice = Buffer.from(JSON.stringify({ a: alice.address, e: Date.now() + 3600_000 })).toString('base64url');
  assert.equal((await call('GET', '/v1/me', { token: `${asAlice}.${tag}` })).status, 401, 'a session cannot be re-pointed at another address');
  assert.equal((await call('GET', '/v1/me', { token: `${body}.${tag}` })).body.address, carol.address);
});

test('create a group and add members by address', async () => {
  const g = await call('POST', '/v1/groups', { token: tokens.alice, body: { name: 'Flat', type: 'flat', displayName: 'Alice' } });
  assert.equal(g.status, 201);
  groupId = g.body.group.id;
  assert.equal(g.body.group.asset.issuer, USDC_ISSUER);
  const b = await call('POST', `/v1/groups/${groupId}/members`, { token: tokens.alice, body: { address: bob.address, displayName: 'Bob' } });
  assert.equal(b.status, 201);
  const a = await call('POST', `/v1/groups/${groupId}/members`, { token: tokens.alice, body: { address: agent.address, displayName: 'Hermes', kind: 'agent' } });
  assert.equal(a.body.member.kind, 'agent');
  assert.equal((await call('POST', `/v1/groups/${groupId}/members`, { token: tokens.alice, body: { address: bob.address } })).body.error.code, 'ALREADY_MEMBER');
  assert.equal((await call('POST', `/v1/groups/${groupId}/members`, { token: tokens.alice, body: { address: 'GNOTANADDRESS' } })).body.error.code, 'INVALID_ADDRESS');
  const members = (await call('GET', `/v1/groups/${groupId}`, { token: tokens.bob })).body.members;
  ids = Object.fromEntries(members.map((m) => [m.displayName.toLowerCase(), m.id]));
  assert.deepEqual(Object.keys(ids).sort(), ['alice', 'bob', 'hermes']);
});

test('non-members cannot see the group', async () => {
  const r = await call('GET', `/v1/groups/${groupId}`, { token: tokens.carol });
  assert.equal(r.status, 404);
  assert.equal((await call('GET', '/v1/groups', { token: tokens.carol })).body.groups.length, 0);
});

test('a secret key anywhere in the body is refused', async () => {
  const secret = `S${'A'.repeat(55)}`;
  const r = await call('POST', `/v1/groups/${groupId}/expenses`, { token: tokens.alice, body: { description: `key ${secret}`, amount: '1', paidBy: ids.alice, split: { type: 'equal', participants: [ids.alice] } } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'SECRET_KEY_REJECTED');
});

test('expenses: equal split, exact mismatch, idempotency', async () => {
  const equal = { description: 'Internet', amount: '10', paidBy: ids.alice, split: { type: 'equal', participants: [ids.alice, ids.bob] } };
  const first = await call('POST', `/v1/groups/${groupId}/expenses`, { token: tokens.alice, body: equal, headers: { 'idempotency-key': 'internet-oct-2026' } });
  assert.equal(first.status, 201);
  assert.equal(first.body.expense.amount, '10.00');
  assert.equal(first.body.expense.idempotencyKey, undefined);
  const again = await call('POST', `/v1/groups/${groupId}/expenses`, { token: tokens.alice, body: equal, headers: { 'idempotency-key': 'internet-oct-2026' } });
  assert.equal(again.body.expense.id, first.body.expense.id);

  const mismatch = await call('POST', `/v1/groups/${groupId}/expenses`, {
    token: tokens.bob,
    body: { description: 'Dinner', amount: '10', paidBy: ids.bob, split: { type: 'exact', shares: [{ memberId: ids.alice, amount: '4' }, { memberId: ids.bob, amount: '5.99' }] } },
  });
  assert.equal(mismatch.status, 422);
  assert.equal(mismatch.body.error.code, 'SPLIT_MISMATCH');
  assert.equal(mismatch.body.error.details.difference, '0.01');

  const outsider = await call('POST', `/v1/groups/${groupId}/expenses`, { token: tokens.alice, body: { ...equal, paidBy: 'not-a-member' } });
  assert.equal(outsider.status, 400);

  const bal = (await call('GET', `/v1/groups/${groupId}/balances`, { token: tokens.bob })).body.balances;
  const net = Object.fromEntries(bal.map((b) => [b.memberId, b.net]));
  assert.deepEqual([net[ids.alice], net[ids.bob], net[ids.hermes]], ['5.00', '-5.00', '0.00']);
  assert.equal((await call('GET', `/v1/groups/${groupId}/expenses`, { token: tokens.bob })).body.expenses.length, 1);
});

test('settlement: dry run, reservation, payment checks, verified payment, replay', async () => {
  const dry = await call('POST', `/v1/groups/${groupId}/settlements?dry_run=true`, { token: tokens.bob, body: { to: ids.alice, amount: '5' } });
  assert.equal(dry.status, 200);
  assert.equal(dry.body.intent.payTo, alice.address);
  assert.equal(dry.body.intent.network, 'stellar:testnet');
  assert.equal(dry.body.intent.id, undefined, 'a dry run reserves nothing');

  const over = await call('POST', `/v1/groups/${groupId}/settlements?dry_run=true`, { token: tokens.bob, body: { to: ids.alice, amount: '6' } });
  assert.equal(over.body.error.code, 'OVERPAY');

  const reserved = await call('POST', `/v1/groups/${groupId}/settlements/intents`, { token: tokens.bob, body: { to: ids.alice, amount: '5' } });
  assert.equal(reserved.status, 201);
  const intent = reserved.body.intent;
  assert.equal(intent.status, 'reserved');
  assert.equal(intent.payTo, alice.address);
  assert.equal(intent.memo.type, 'hash');
  assert.match(intent.memo.value, /^[0-9a-f]{64}$/);
  assert.ok(Date.parse(intent.expiresAt) > Date.parse(intent.reservedAt));

  const pay = (amount, issuer = USDC_ISSUER) => [{ type: 'payment', from: bob.address, to: alice.address, asset_code: 'USDC', asset_issuer: issuer, amount }];
  const hash = (n) => n.toString(16).padStart(64, '0');
  const memo = Buffer.from(intent.memo.value, 'hex').toString('base64');
  const maxTime = String(Math.floor(Date.parse(intent.expiresAt) / 1000));
  chain.set(hash(1), { ops: pay('4.0000000'), memo, maxTime });
  chain.set(hash(2), { ops: pay('5.0000000', carol.address), memo, maxTime });
  chain.set(hash(3), { ops: pay('5.0000000'), memo, maxTime, successful: false });
  chain.set(hash(4), { ops: pay('5.0000000'), memo, maxTime });
  // Review fix 1: an older real payment for the right amount has no memo, or another intent's memo.
  chain.set(hash(5), { ops: pay('5.0000000') });
  chain.set(hash(6), { ops: pay('5.0000000'), memo: Buffer.alloc(32, 1).toString('base64'), maxTime });
  // Valid past the intent's expiry, or with no time bounds: it could reach the chain after the intent expired.
  chain.set(hash(7), { ops: pay('5.0000000'), memo, maxTime: String(Number(maxTime) + 60) });
  chain.set(hash(8), { ops: pay('5.0000000'), memo });

  const record = (txHash, extra = {}, token = tokens.bob) =>
    call('POST', `/v1/groups/${groupId}/settlements`, { token, body: { intentId: intent.id, txHash, ...extra } });
  for (const [n, code] of [[1, 'PAYMENT_MISMATCH'], [2, 'PAYMENT_MISMATCH'], [3, 'PAYMENT_FAILED'], [99, 'PAYMENT_NOT_FOUND'], [5, 'INTENT_MISMATCH'], [6, 'INTENT_MISMATCH'], [7, 'TIMEBOUNDS_TOO_LONG'], [8, 'TIMEBOUNDS_TOO_LONG']]) {
    const r = await record(hash(n));
    assert.equal(r.body.error.code, code, `tx ${n}`);
  }
  const noIntent = await call('POST', `/v1/groups/${groupId}/settlements`, { token: tokens.bob, body: { to: ids.alice, amount: '5', txHash: hash(4) } });
  assert.equal(noIntent.status, 404);
  assert.equal(noIntent.body.error.code, 'INTENT_NOT_FOUND');
  assert.equal((await record(hash(4), {}, tokens.alice)).body.error.code, 'INTENT_NOT_FOUND', "only the intent's payer can use it");
  assert.equal((await record(hash(4), { amount: '4' })).status, 400, 'terms in the body must match the intent');

  const ok = await record(hash(4), { to: ids.alice, amount: '5' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.settlement.intentId, intent.id);
  assert.match(ok.body.explorerUrl, /stellar\.expert\/explorer\/testnet\/tx\//);
  const net = (await call('GET', `/v1/groups/${groupId}`, { token: tokens.alice })).body.balances.map((b) => b.net);
  assert.deepEqual(net, ['0.00', '0.00', '0.00']);

  const replay = await record(hash(4));
  assert.equal(replay.status, 409);
  assert.equal(replay.body.error.code, 'INTENT_NOT_OPEN');
  const activity = (await call('GET', `/v1/groups/${groupId}/activity`, { token: tokens.alice })).body.items;
  assert.deepEqual(activity.map((i) => i.type).sort(), ['expense', 'settlement']);
});

test('an agent token works as a member and its expenses are marked as agent', async () => {
  assert.equal((await call('GET', '/v1/groups', { token: 'wrong-token' })).status, 401);
  const groups = (await call('GET', '/v1/groups', { token: agentToken })).body.groups;
  assert.equal(groups[0].id, groupId);
  const r = await call('POST', `/v1/groups/${groupId}/expenses`, {
    token: agentToken,
    body: { description: 'Electricity', amount: '42', paidBy: ids.hermes, split: { type: 'equal', participants: [ids.alice, ids.bob, ids.hermes] }, source: 'manual' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.expense.source, 'agent');
  assert.deepEqual(r.body.expense.shares.map((s) => s.amount), ['14.00', '14.00', '14.00']);
});

test('invites: a targeted invite only works for its address', async () => {
  const inv = await call('POST', `/v1/groups/${groupId}/invites`, { token: tokens.alice, body: { address: alice.address } });
  assert.equal(inv.status, 201);
  assert.equal((await call('POST', `/v1/invites/${inv.body.code}/accept`, { token: tokens.carol })).status, 404);
  const open = await call('POST', `/v1/groups/${groupId}/invites`, { token: tokens.alice, body: {} });
  const accepted = await call('POST', `/v1/invites/${open.body.code}/accept`, { token: tokens.carol });
  assert.deepEqual(accepted.body, { groupId, alreadyMember: false });
  assert.equal((await call('GET', `/v1/groups/${groupId}`, { token: tokens.carol })).status, 200);
});

test('unknown routes and wrong methods', async () => {
  assert.equal((await call('GET', '/v1/nope')).status, 404);
  assert.equal((await call('DELETE', '/v1/groups')).status, 405);
  assert.equal((await call('POST', '/v1/groups', { token: tokens.alice, body: '{not json' })).body.error.code, 'VALIDATION');
});


// ---- Review findings (PR 51) ----

const hex = (n) => `f${n.toString(16).padStart(63, '0')}`;
const payment = (from, to, amount) => [{ type: 'payment', from: from.address, to: to.address, asset_code: 'USDC', asset_issuer: USDC_ISSUER, amount }];

async function groupWithDebt() {
  // Bob owes Alice 5.00 in a fresh group.
  const g = await call('POST', '/v1/groups', { token: tokens.alice, body: { name: `Debt ${Math.random()}`, displayName: 'Alice' } });
  const id = g.body.group.id;
  await call('POST', `/v1/groups/${id}/members`, { token: tokens.alice, body: { address: bob.address, displayName: 'Bob' } });
  const members = (await call('GET', `/v1/groups/${id}`, { token: tokens.alice })).body.members;
  const m = Object.fromEntries(members.map((x) => [x.displayName.toLowerCase(), x.id]));
  const e = await call('POST', `/v1/groups/${id}/expenses`, { token: tokens.alice, body: { description: 'Rent', amount: '10', paidBy: m.alice, split: { type: 'equal', participants: [m.alice, m.bob] } } });
  assert.equal(e.status, 201);
  return { id, m };
}

// Reserves an intent and returns the transaction fields a correct payment for it carries.
async function reserve(id, to, amount = '5', token = tokens.bob) {
  const r = await call('POST', `/v1/groups/${id}/settlements/intents`, { token, body: { to, amount } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const { intent } = r.body;
  return { intent, memo: Buffer.from(intent.memo.value, 'hex').toString('base64'), maxTime: String(Math.floor(Date.parse(intent.expiresAt) / 1000)) };
}

test('an old payment cannot settle a debt that appeared later', async () => {
  const { id, m } = await groupWithDebt();
  const { intent } = await reserve(id, m.alice);
  // A real payment from Bob to Alice for the right amount, made before the intent existed, so without its memo.
  chain.set(hex(1), { ops: payment(bob, alice, '5.0000000'), createdAt: '2026-09-01T10:00:00Z' });
  const r = await call('POST', `/v1/groups/${id}/settlements`, { token: tokens.bob, body: { intentId: intent.id, txHash: hex(1) } });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'INTENT_MISMATCH');
  const net = (await call('GET', `/v1/groups/${id}`, { token: tokens.alice })).body.balances.map((b) => b.net);
  assert.deepEqual(net, ['5.00', '-5.00']);
});

test('two concurrent settlements for the same debt: one is recorded, the other is refused', async () => {
  const { id, m } = await groupWithDebt();
  // Two reservations at once: the database lets one win.
  const both = await Promise.all([0, 1].map(() => call('POST', `/v1/groups/${id}/settlements/intents`, { token: tokens.bob, body: { to: m.alice, amount: '5' } })));
  assert.deepEqual(both.map((r) => r.status).sort(), [201, 409]);
  assert.equal(both.find((r) => r.status === 409).body.error.code, 'INTENT_IN_PROGRESS');

  // Two payments reported for the winning intent at once. The chain answers slowly, so both read the debt before either
  // one records; recording closes the intent in the same step, so the second is refused.
  const { intent } = both.find((r) => r.status === 201).body;
  const memo = Buffer.from(intent.memo.value, 'hex').toString('base64');
  const maxTime = String(Math.floor(Date.parse(intent.expiresAt) / 1000));
  chain.set(hex(2), { ops: payment(bob, alice, '5.0000000'), memo, maxTime, delayMs: 40 });
  chain.set(hex(3), { ops: payment(bob, alice, '5.0000000'), memo, maxTime, delayMs: 40 });
  const send = (h) => call('POST', `/v1/groups/${id}/settlements`, { token: tokens.bob, body: { intentId: intent.id, txHash: h } });
  const results = await Promise.all([send(hex(2)), send(hex(3))]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(results.find((r) => r.status === 409).body.error.code, 'INTENT_NOT_OPEN');
  const net = (await call('GET', `/v1/groups/${id}`, { token: tokens.alice })).body.balances.map((b) => b.net);
  assert.deepEqual(net, ['0.00', '0.00']);
});

test('a crafted bearer token gets 401, not 500', async () => {
  for (const token of [`a.${'é'.repeat(43)}`, `${'é'.repeat(10)}.${'é'.repeat(43)}`, 'a.b']) {
    const r = await call('GET', '/v1/groups', { token });
    assert.equal(r.status, 401, token.slice(0, 12));
  }
});

test('an invalid display name does not leave an empty group behind', async () => {
  const repo = createMemoryRepository();
  let inserted = 0;
  const counting = { ...repo, insertGroup: async (g) => (inserted += 1, repo.insertGroup(g)) };
  const stellar = createStellar({ horizonUrl: 'https://horizon.test', usdcIssuer: USDC_ISSUER, fetchImpl: fakeHorizon });
  const ledger = createLedger({ repo: counting, stellar });
  const me = { kind: 'human', address: alice.address };
  await assert.rejects(() => ledger.createGroup(me, { name: 'Orphan', displayName: 'x'.repeat(100) }), { status: 400 });
  await assert.rejects(() => ledger.createGroup({ kind: 'human', address: 'GNOTANADDRESS' }, { name: 'Orphan' }), { status: 400 });
  assert.equal(inserted, 0, 'no group row may be written for a request that is refused');
  assert.equal((await ledger.createGroup(me, { name: 'Fine', displayName: 'Alice' })).group.name, 'Fine');
  assert.equal(inserted, 1);
});

test('an oversized body gets a 413 with a JSON error', async () => {
  const r = await call('POST', '/v1/groups', { token: tokens.alice, body: JSON.stringify({ name: 'x', pad: 'y'.repeat(200 * 1024) }) });
  assert.equal(r.status, 413);
  assert.equal(r.body.error.message, 'Request body too large');
});

test('a secret key written with JSON escapes is refused', async () => {
  const escaped = `{"name":"Trip","displayName":"\\u0053${'A'.repeat(55)}"}`;
  const r = await call('POST', '/v1/groups', { token: tokens.alice, body: escaped });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'SECRET_KEY_REJECTED');
});

test('values of the wrong type are refused instead of stored', async () => {
  for (const body of [{ homeCurrency: ['USD'] }, { homeCurrency: 123 }, { email: 5 }, { email: ['a@b.co'] }]) {
    const r = await call('PATCH', '/v1/me', { token: tokens.alice, body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body.error.code, 'VALIDATION');
  }
});

test('an unreachable upstream is a 502, not a 500', async () => {
  const repo = { ...createMemoryRepository(), getUser: async () => { throw new TypeError('fetch failed'); } };
  const auth = createAuth({ secret: 'test-secret-at-least-32-characters-long', repo });
  const stellar = createStellar({ horizonUrl: 'https://horizon.test', usdcIssuer: USDC_ISSUER, fetchImpl: fakeHorizon });
  const srv = createApp({ auth, ledger: createLedger({ repo, stellar }), log: () => {} });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const url = `http://127.0.0.1:${srv.address().port}`;
    const w = wallet();
    const c = await (await fetch(`${url}/v1/auth/challenge`, { method: 'POST', body: JSON.stringify({ address: w.address }) })).json();
    const v = await (await fetch(`${url}/v1/auth/verify`, { method: 'POST', body: JSON.stringify({ address: w.address, challenge: c.challenge, signature: w.signMessage(c.challenge) }) })).json();
    const r = await fetch(`${url}/v1/me`, { headers: { authorization: `Bearer ${v.session.token}` } });
    assert.equal(r.status, 502);
    assert.equal((await r.json()).error.code, 'UPSTREAM_UNAVAILABLE');
  } finally {
    srv.close();
  }
});

test('a Horizon that cannot be reached is reported as unavailable', async () => {
  const down = createStellar({ horizonUrl: 'https://horizon.test', usdcIssuer: USDC_ISSUER, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(() => down.verifyPayment({ txHash: hex(9), from: bob.address, to: alice.address, amount: '5.00' }), { code: 'HORIZON_UNAVAILABLE' });
});

test('listing groups loads them in parallel', async () => {
  const repo = createMemoryRepository();
  let inFlight = 0;
  let peak = 0;
  const slow = (fn) => async (...a) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight -= 1;
    return fn(...a);
  };
  const wrapped = { ...repo, listMembers: slow(repo.listMembers) };
  const stellar = createStellar({ horizonUrl: 'https://horizon.test', usdcIssuer: USDC_ISSUER, fetchImpl: fakeHorizon });
  const ledger = createLedger({ repo: wrapped, stellar });
  const me = { kind: 'human', address: alice.address };
  for (const name of ['One', 'Two', 'Three']) await ledger.createGroup(me, { name, displayName: 'Alice' });
  peak = 0;
  const out = await ledger.listGroups(me);
  assert.equal(out.groups.length, 3);
  assert.ok(peak >= 3, `expected the three groups to load at once, peak was ${peak}`);
});
