import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import { createAuth, encodeAddress, parseAgentTokens } from '../src/auth/index.js';
import { createMemoryRepository } from '../src/repositories/index.js';
import { createLedger } from '../src/services/ledger.js';
import { createStellar, TESTNET_PASSPHRASE } from '../src/stellar/index.js';
import { createApp } from '../src/server.js';

// Delegated agent payments (ADR 0005): link an agent to its owner, let it reserve the owner's debt, pay it through the x402-style handshake.
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const sha256 = (d) => createHash('sha256').update(d).digest();
const hash = (n) => n.toString(16).padStart(64, '0');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const address = encodeAddress(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
  return { address, signMessage: (m) => sign(null, sha256(`Stellar Signed Message:\n${m}`), privateKey).toString('base64') };
}

const alice = wallet(); // owner, owes 10 to bob
const bob = wallet();
const hermes = wallet(); // agent
const other = wallet(); // second agent
const stranger = wallet(); // valid address, not in AGENT_TOKENS
const tokenOf = { hermes: 'hermes-token-for-tests-0123456789', other: 'other-token-for-tests-01234567890' };

let server, base, clock, chain, ctx;

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}

const deposit = (amount) =>
  call('POST', `/v1/groups/${ctx.g}/expenses`, { token: ctx.session.bob, body: { description: 'Rent', amount, paidBy: ctx.id[bob.address], split: { type: 'equal', participants: [ctx.id[alice.address], ctx.id[bob.address]] } } });

beforeEach(async () => {
  clock = Date.parse('2026-10-25T18:00:00Z');
  chain = new Map();
  const fakeHorizon = async (url) => {
    const path = new URL(url).pathname;
    const json = (status, body) => new Response(JSON.stringify(body), { status });
    if (path === '/') return json(200, { network_passphrase: TESTNET_PASSPHRASE });
    const m = /^\/transactions\/([0-9a-f]{64})(\/operations)?$/.exec(path);
    const tx = m && chain.get(m[1]);
    if (!tx) return json(404, {});
    if (m[2]) return json(200, { _embedded: { records: tx.ops } });
    return json(200, { successful: true, created_at: new Date(clock).toISOString(), memo_type: 'hash', memo: tx.memo, preconditions: { timebounds: { min_time: '0', max_time: tx.maxTime } } });
  };
  const repo = createMemoryRepository();
  const stellar = createStellar({ horizonUrl: 'https://horizon.test', usdcIssuer: USDC_ISSUER, fetchImpl: fakeHorizon });
  const tokens = Object.entries(tokenOf).map(([k, t]) => `${sha256(t).toString('hex')}=${{ hermes, other }[k].address}`).join(',');
  const auth = createAuth({ secret: 'test-secret-at-least-32-characters-long', repo, agentTokens: parseAgentTokens(tokens), now: () => clock });
  server = createApp({ auth, ledger: createLedger({ repo, stellar, now: () => new Date(clock) }), log: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  ctx = { session: {} };
  for (const [name, w] of Object.entries({ alice, bob })) {
    const { body: c } = await call('POST', '/v1/auth/challenge', { body: { address: w.address } });
    const r = await call('POST', '/v1/auth/verify', { body: { address: w.address, challenge: c.challenge, signature: w.signMessage(c.challenge) } });
    ctx.session[name] = r.body.session.token;
  }
  // Group: bob paid 20 for alice and bob, so alice owes bob 10. Both agents are members.
  ctx.g = (await call('POST', '/v1/groups', { token: ctx.session.alice, body: { name: 'Flat' } })).body.group.id;
  for (const [address, kind] of [[bob.address, 'human'], [hermes.address, 'agent'], [other.address, 'agent']]) {
    await call('POST', `/v1/groups/${ctx.g}/members`, { token: ctx.session.alice, body: { address, kind } });
  }
  const members = (await call('GET', `/v1/groups/${ctx.g}`, { token: ctx.session.alice })).body.members;
  ctx.id = Object.fromEntries(members.map((m) => [m.address, m.id]));
  await deposit('20');
});
afterEach(() => server.close());

const challenge = (agentAddress, token = ctx.session.alice) => call('POST', '/v1/agents/link/challenge', { token, body: { agentAddress } });
async function link(agent = hermes, owner = alice, token = ctx.session.alice) {
  const c = await challenge(agent.address, token);
  return call('POST', '/v1/agents/link', { token, body: { agentAddress: agent.address, message: c.body.message, signature: owner.signMessage(c.body.message) } });
}
const reserve = (token, body) => call('POST', `/v1/groups/${ctx.g}/settlements/intents`, { token, body });
const forOwner = (amount = '10') => ({ to: ctx.id[bob.address], amount, onBehalfOf: ctx.id[alice.address] });
const balances = async () => Object.fromEntries((await call('GET', `/v1/groups/${ctx.g}/balances`, { token: ctx.session.alice })).body.balances.map((b) => [b.address, b.net]));
const payment = (from, amount) => [{ type: 'payment', from, to: bob.address, asset_code: 'USDC', asset_issuer: USDC_ISSUER, amount }];
const onChain = (n, i, from, amount = '10.0000000') =>
  chain.set(hash(n), { ops: payment(from, amount), memo: Buffer.from(i.memo.value, 'hex').toString('base64'), maxTime: String(Date.parse(i.expiresAt) / 1000) });

test('link: challenge message format, signed link, listed, 201 shape', async () => {
  const c = await challenge(hermes.address);
  assert.equal(c.status, 200);
  assert.equal(c.body.message, `Stellar Split agent link\nOwner: ${alice.address}\nAgent: ${hermes.address}\nNonce: ${c.body.nonce}\nExpires: ${c.body.expiresAt}`);
  assert.equal(Date.parse(c.body.expiresAt) - clock, 5 * 60_000);
  const r = await call('POST', '/v1/agents/link', { token: ctx.session.alice, body: { agentAddress: hermes.address, message: c.body.message, signature: alice.signMessage(c.body.message) } });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.agent, { address: hermes.address, ownerAddress: alice.address, linkedAt: new Date(clock).toISOString() });
  const list = await call('GET', '/v1/me/agents', { token: ctx.session.alice });
  assert.deepEqual(list.body.agents, [{ address: hermes.address, linkedAt: new Date(clock).toISOString(), revokedAt: null }]);
  assert.equal((await call('GET', '/v1/me/agents', { token: tokenOf.hermes })).status, 403, 'agents cannot manage links');
});

test('link: a signature from anyone but the owner is refused', async () => {
  const c = await challenge(hermes.address);
  const r = await call('POST', '/v1/agents/link', { token: ctx.session.alice, body: { agentAddress: hermes.address, message: c.body.message, signature: bob.signMessage(c.body.message) } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'LINK_INVALID');
});

test('link: an expired, reused or edited challenge is refused', async () => {
  const c = await challenge(hermes.address);
  const send = () => call('POST', '/v1/agents/link', { token: ctx.session.alice, body: { agentAddress: hermes.address, message: c.body.message, signature: alice.signMessage(c.body.message) } });
  clock += 5 * 60_000 + 1000;
  assert.equal((await send()).body.error.code, 'LINK_INVALID', 'expired');
  clock -= 5 * 60_000 + 1000;
  assert.equal((await send()).status, 201);
  assert.equal((await send()).body.error.code, 'LINK_INVALID', 'the nonce is burned');
  const edited = (await challenge(hermes.address)).body.message.replace(/Expires: .*/, 'Expires: 2099-01-01T00:00:00.000Z');
  const forged = await call('POST', '/v1/agents/link', { token: ctx.session.alice, body: { agentAddress: hermes.address, message: edited, signature: alice.signMessage(edited) } });
  assert.equal(forged.body.error.code, 'LINK_INVALID', 'an edited message fails its MAC');
});

test('link: only configured agents, not the owner itself, one owner per agent', async () => {
  assert.equal((await challenge(stranger.address)).body.error.code, 'AGENT_NOT_REGISTERED');
  assert.equal((await challenge(alice.address)).status, 400);
  assert.equal((await call('POST', '/v1/agents/link/challenge', { token: tokenOf.hermes, body: { agentAddress: hermes.address } })).status, 403);
  assert.equal((await link()).status, 201);
  const second = await link(hermes, bob, ctx.session.bob);
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'AGENT_ALREADY_LINKED');
});

test('revoke: 204, listed with revokedAt, the agent is refused afterwards and can be linked again', async () => {
  await link();
  assert.equal((await call('DELETE', `/v1/me/agents/${hermes.address}`, { token: ctx.session.bob })).status, 404, 'only the owner');
  assert.equal((await call('DELETE', `/v1/me/agents/${hermes.address}`, { token: ctx.session.alice })).status, 204);
  const list = await call('GET', '/v1/me/agents', { token: ctx.session.alice });
  assert.equal(list.body.agents[0].revokedAt, new Date(clock).toISOString());
  const r = await reserve(tokenOf.hermes, forOwner('1'));
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'NOT_LINKED');
  assert.equal((await link(hermes, bob, ctx.session.bob)).status, 201, 'a revoked agent can be linked to someone else');
});

test('on behalf: without a link, for another member, or from another agent, the answer is 403 NOT_LINKED', async () => {
  assert.equal((await reserve(tokenOf.hermes, forOwner())).body.error.code, 'NOT_LINKED');
  await link();
  const forBob = await reserve(tokenOf.hermes, { to: ctx.id[alice.address], amount: '1', onBehalfOf: ctx.id[bob.address] });
  assert.equal(forBob.body.error.code, 'NOT_LINKED');
  assert.equal((await reserve(tokenOf.other, forOwner())).body.error.code, 'NOT_LINKED', 'a different agent is not covered by the link');
  assert.equal((await reserve(ctx.session.alice, forOwner())).body.error.code, 'NOT_LINKED', 'onBehalfOf is for agents');
});

test('on behalf: the intent names the agent as payer and the owner as debtor', async () => {
  await link();
  const r = await reserve(tokenOf.hermes, forOwner());
  assert.equal(r.status, 201);
  assert.equal(r.body.intent.payer, hermes.address);
  assert.equal(r.body.intent.debtorMemberId, ctx.id[alice.address]);
  assert.equal(r.body.intent.payTo, bob.address);
  const own = await reserve(ctx.session.alice, { to: ctx.id[bob.address], amount: '1' });
  assert.equal(own.status, 409, 'the owner is blocked while the agent holds the debt');
});

test('on behalf: the agent and the owner racing for the same debt get one 201 and one 409', async () => {
  await link();
  const results = await Promise.all([reserve(tokenOf.hermes, forOwner()), reserve(ctx.session.alice, { to: ctx.id[bob.address], amount: '10' })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(results.find((r) => r.status === 409).body.error.code, 'INTENT_IN_PROGRESS');
});

test('on behalf: agent spend caps apply, including what it already paid for its owner', async () => {
  await link();
  await deposit('200'); // alice now owes bob 110
  const over = await reserve(tokenOf.hermes, forOwner('25.01'));
  assert.equal(over.status, 403);
  assert.equal(over.body.error.code, 'AGENT_CAP_PER_PAYMENT');
  for (let n = 1; n <= 2; n += 1) {
    const { body } = await reserve(tokenOf.hermes, forOwner('25'));
    onChain(n, body.intent, hermes.address, '25.0000000');
    const paid = await call('POST', `/v1/groups/${ctx.g}/settlements`, { token: tokenOf.hermes, body: { intentId: body.intent.id, txHash: hash(n) } });
    assert.equal(paid.status, 201);
  }
  assert.equal((await reserve(tokenOf.hermes, forOwner('0.01'))).body.error.code, 'AGENT_CAP_PER_DAY');
  assert.equal((await reserve(ctx.session.alice, { to: ctx.id[bob.address], amount: '60' })).status, 201, 'the owner is not capped');
});

/** Alice's agent reserves 10 for her debt; hash(1) is the agent's payment on the fake chain and hash(2) alice's own. */
async function reserved() {
  await link();
  const { i } = { i: (await reserve(tokenOf.hermes, forOwner())).body.intent };
  onChain(1, i, hermes.address);
  onChain(2, i, alice.address);
  return { i, url: `/v1/groups/${ctx.g}/settlements/intents/${i.id}/x402` };
}
const sig = (txHash) => ({ 'payment-signature': b64({ x402Version: 1, scheme: 'exact', network: 'stellar:testnet', payload: { txHash } }) });

test('x402: no payment header answers 402 with terms in the header and the body', async () => {
  const { i, url } = await reserved();
  const r = await call('POST', url, { token: tokenOf.hermes });
  assert.equal(r.status, 402);
  assert.deepEqual(JSON.parse(Buffer.from(r.headers.get('payment-required'), 'base64').toString()), r.body);
  assert.deepEqual(r.body, {
    x402Version: 1,
    error: null,
    accepts: [{
      scheme: 'exact', network: 'stellar:testnet', asset: `USDC:${USDC_ISSUER}`, payTo: bob.address, amount: '10.00', maxTimeoutSeconds: 600, resource: base + url,
      extra: { intentId: i.id, memoType: 'hash', memo: i.memo.value, expiresAt: i.expiresAt },
    }],
  });
});

test('x402: a valid payment from the agent settles the owner debt', async () => {
  const { url } = await reserved();
  const r = await call('POST', url, { token: tokenOf.hermes, headers: sig(hash(1)) });
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(Buffer.from(r.headers.get('payment-response'), 'base64').toString()), { success: true, transaction: hash(1), network: 'stellar:testnet' });
  assert.equal(r.body.settlement.txHash, hash(1));
  assert.equal((await balances())[alice.address], '0.00');
  assert.equal((await call('POST', url, { token: tokenOf.hermes, headers: sig(hash(1)) })).status, 409, 'the intent is closed');
});

test('x402: a transaction paid by someone else, or not found, answers 402 with an error and fresh terms', async () => {
  const { url } = await reserved();
  const wrong = await call('POST', url, { token: tokenOf.hermes, headers: sig(hash(2)) });
  assert.equal(wrong.status, 402);
  assert.match(wrong.body.error, /^PAYMENT_MISMATCH/);
  assert.equal(wrong.body.accepts.length, 1);
  assert.equal(JSON.parse(Buffer.from(wrong.headers.get('payment-required'), 'base64').toString()).error, wrong.body.error);
  assert.match((await call('POST', url, { token: tokenOf.hermes, headers: sig(hash(9)) })).body.error, /^PAYMENT_NOT_FOUND/);
  assert.match((await call('POST', url, { token: tokenOf.hermes, headers: { 'payment-signature': 'not base64 json' } })).body.error, /PAYMENT-SIGNATURE/);
  assert.equal((await balances())[alice.address], '-10.00', 'nothing was recorded');
});

test('x402: only the intent payer can call it', async () => {
  const { url } = await reserved();
  for (const token of [ctx.session.alice, ctx.session.bob, tokenOf.other]) {
    const r = await call('POST', url, { token, headers: sig(hash(1)) });
    assert.equal(r.status, 404, 'alice is the debtor, not the payer');
    assert.equal(r.body.error.code, 'INTENT_NOT_FOUND');
  }
  assert.equal((await call('POST', url)).status, 401);
});

test('x402: a human pays their own intent the same way', async () => {
  const { body } = await reserve(ctx.session.alice, { to: ctx.id[bob.address], amount: '10' });
  onChain(3, body.intent, alice.address);
  const url = `/v1/groups/${ctx.g}/settlements/intents/${body.intent.id}/x402`;
  assert.equal((await call('POST', url, { token: ctx.session.alice })).status, 402);
  assert.equal((await call('POST', url, { token: ctx.session.alice, headers: sig(hash(3)) })).status, 200);
});
