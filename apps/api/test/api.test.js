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
  return m[2] ? json(200, { _embedded: { records: tx.ops } }) : json(200, { successful: tx.successful ?? true, created_at: '2026-10-25T15:00:00Z' });
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
  const bad = await call('POST', '/v1/auth/challenge', { body: { address: `${alice.address.slice(0, -1)}A` } });
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

test('settlement: dry run, overpay, unverified payment, verified payment, duplicate', async () => {
  const dry = await call('POST', `/v1/groups/${groupId}/settlements?dry_run=true`, { token: tokens.bob, body: { to: ids.alice, amount: '5' } });
  assert.equal(dry.status, 200);
  assert.equal(dry.body.intent.payTo, alice.address);
  assert.equal(dry.body.intent.network, 'stellar:testnet');

  const over = await call('POST', `/v1/groups/${groupId}/settlements?dry_run=true`, { token: tokens.bob, body: { to: ids.alice, amount: '6' } });
  assert.equal(over.body.error.code, 'OVERPAY');

  const pay = (amount, issuer = USDC_ISSUER) => [{ type: 'payment', from: bob.address, to: alice.address, asset_code: 'USDC', asset_issuer: issuer, amount }];
  const hash = (n) => n.toString(16).padStart(64, '0');
  chain.set(hash(1), { ops: pay('4.0000000') });
  chain.set(hash(2), { ops: pay('5.0000000', carol.address) });
  chain.set(hash(3), { ops: pay('5.0000000'), successful: false });
  chain.set(hash(4), { ops: pay('5.0000000') });

  for (const [h, code] of [[hash(1), 'PAYMENT_MISMATCH'], [hash(2), 'PAYMENT_MISMATCH'], [hash(3), 'PAYMENT_FAILED'], [hash(99), 'PAYMENT_NOT_FOUND']]) {
    const r = await call('POST', `/v1/groups/${groupId}/settlements`, { token: tokens.bob, body: { to: ids.alice, amount: '5', txHash: h } });
    assert.equal(r.body.error.code, code, `tx ${h.slice(-2)}`);
  }

  const ok = await call('POST', `/v1/groups/${groupId}/settlements`, { token: tokens.bob, body: { to: ids.alice, amount: '5', txHash: hash(4) } });
  assert.equal(ok.status, 201);
  assert.match(ok.body.explorerUrl, /stellar\.expert\/explorer\/testnet\/tx\//);
  const net = (await call('GET', `/v1/groups/${groupId}`, { token: tokens.alice })).body.balances.map((b) => b.net);
  assert.deepEqual(net, ['0.00', '0.00', '0.00']);

  // Debt is now zero, so a replay is refused before the duplicate check.
  const replay = await call('POST', `/v1/groups/${groupId}/settlements`, { token: tokens.bob, body: { to: ids.alice, amount: '5', txHash: hash(4) } });
  assert.equal(replay.status, 422);
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
