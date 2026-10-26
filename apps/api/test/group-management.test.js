import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createAuth, encodeAddress } from '../src/auth/index.js';
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

const alice = wallet();
const bob = wallet();
const carol = wallet();
const tokens = {};
let base;
let server;

before(async () => {
  const repo = createMemoryRepository();
  const stellar = createStellar({ horizonUrl: 'https://horizon.test', usdcIssuer: USDC_ISSUER, fetchImpl: async () => new Response(JSON.stringify({ network_passphrase: TESTNET_PASSPHRASE }), { status: 200 }) });
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

async function newGroup(name = 'Trip') {
  const g = await call('POST', '/v1/groups', tokens.alice, { name, type: 'trip', displayName: 'Alice' });
  const id = g.body.group.id;
  const b = await call('POST', `/v1/groups/${id}/members`, tokens.alice, { address: bob.address, displayName: 'Bob' });
  const c = await call('POST', `/v1/groups/${id}/members`, tokens.alice, { address: carol.address, displayName: 'Carol' });
  return { id, alice: g.body.me, bob: b.body.member.id, carol: c.body.member.id };
}

const spend = (g, paidBy, participants) =>
  call('POST', `/v1/groups/${g.id}/expenses`, tokens.alice, { description: 'Dinner', amount: '30.00', paidBy, split: { type: 'equal', participants } });

test('only the creator edits the name and type', async () => {
  const g = await newGroup();
  const ok = await call('PATCH', `/v1/groups/${g.id}`, tokens.alice, { name: ' Lisbon ', type: 'flat' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.group.name, 'Lisbon');
  assert.equal(ok.body.group.type, 'flat');
  assert.equal((await call('PATCH', `/v1/groups/${g.id}`, tokens.bob, { name: 'Mine now' })).status, 403);
  assert.equal((await call('PATCH', `/v1/groups/${g.id}`, tokens.alice, { name: '' })).status, 400);
  assert.equal((await call('PATCH', `/v1/groups/${g.id}`, tokens.alice, { type: 'castle' })).status, 400);
  assert.equal((await call('PATCH', `/v1/groups/${g.id}`, tokens.alice, {})).status, 400);
});

test('a stranger gets 404 on edit, delete and remove', async () => {
  const g = await newGroup();
  const stranger = wallet();
  const { challenge } = await (await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: stranger.address }) })).json();
  const v = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: stranger.address, challenge, signature: stranger.signMessage(challenge) }) });
  const token = (await v.json()).session.token;
  assert.equal((await call('PATCH', `/v1/groups/${g.id}`, token, { name: 'x' })).status, 404);
  assert.equal((await call('DELETE', `/v1/groups/${g.id}`, token)).status, 404);
  assert.equal((await call('DELETE', `/v1/groups/${g.id}/members/${g.bob}`, token)).status, 404);
});

test('a group with no expenses is deleted for good', async () => {
  const g = await newGroup();
  assert.equal((await call('DELETE', `/v1/groups/${g.id}`, tokens.bob)).status, 403);
  const r = await call('DELETE', `/v1/groups/${g.id}`, tokens.alice);
  assert.deepEqual(r.body, { result: 'deleted' });
  assert.equal((await call('GET', `/v1/groups/${g.id}`, tokens.alice)).status, 404);
});

test('a group with expenses is archived: hidden from everyone, not deleted', async () => {
  const g = await newGroup();
  assert.equal((await spend(g, g.alice, [g.alice, g.bob])).status, 201);
  const r = await call('DELETE', `/v1/groups/${g.id}`, tokens.alice);
  assert.deepEqual(r.body, { result: 'archived' });
  assert.equal((await call('GET', `/v1/groups/${g.id}`, tokens.bob)).status, 404);
  const list = await call('GET', '/v1/groups', tokens.bob);
  assert.ok(!list.body.groups.some((x) => x.id === g.id));
  assert.equal((await call('POST', `/v1/groups/${g.id}/invites`, tokens.alice, {})).status, 404);
  assert.equal((await spend(g, g.alice, [g.alice])).status, 404);
});

test('a member with no history can leave or be removed; one with history cannot', async () => {
  const g = await newGroup();
  assert.equal((await spend(g, g.alice, [g.alice, g.bob])).status, 201);
  // Bob is in an expense: neither he nor the creator can remove him.
  assert.equal((await call('DELETE', `/v1/groups/${g.id}/members/${g.bob}`, tokens.bob)).body.error.code, 'MEMBER_HAS_HISTORY');
  assert.equal((await call('DELETE', `/v1/groups/${g.id}/members/${g.bob}`, tokens.alice)).body.error.code, 'MEMBER_HAS_HISTORY');
  // Carol is in none: she can leave, and the creator can remove her.
  assert.equal((await call('DELETE', `/v1/groups/${g.id}/members/${g.carol}`, tokens.carol)).status, 204);
  assert.equal((await call('GET', `/v1/groups/${g.id}`, tokens.carol)).status, 404);
  const again = await call('GET', `/v1/groups/${g.id}`, tokens.alice);
  assert.deepEqual(again.body.members.map((m) => m.displayName).sort(), ['Alice', 'Bob']);
  // Balances still add up with her gone.
  assert.equal(again.body.balances.length, 2);
});

test('the creator can remove someone, but a member cannot remove another member', async () => {
  const g = await newGroup();
  assert.equal((await call('DELETE', `/v1/groups/${g.id}/members/${g.carol}`, tokens.bob)).status, 403);
  assert.equal((await call('DELETE', `/v1/groups/${g.id}/members/${g.carol}`, tokens.alice)).status, 204);
  assert.equal((await call('DELETE', `/v1/groups/${g.id}/members/${g.carol}`, tokens.alice)).status, 404);
});

test('the creator cannot leave their own group', async () => {
  const g = await newGroup();
  const r = await call('DELETE', `/v1/groups/${g.id}/members/${g.alice}`, tokens.alice);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'CREATOR_CANNOT_LEAVE');
});

test('an invite to an archived group no longer works', async () => {
  const g = await newGroup();
  const invite = await call('POST', `/v1/groups/${g.id}/invites`, tokens.alice, {});
  await spend(g, g.alice, [g.alice, g.bob]);
  await call('DELETE', `/v1/groups/${g.id}`, tokens.alice);
  const stranger = wallet();
  const { challenge } = await (await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: stranger.address }) })).json();
  const v = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: stranger.address, challenge, signature: stranger.signMessage(challenge) }) });
  const token = (await v.json()).session.token;
  assert.equal((await call('POST', `/v1/invites/${invite.body.code}/accept`, token)).status, 404);
});
