import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSupabaseRepository } from '../src/repositories/index.js';

// Fake PostgREST: records requests, enforces unique keys like Postgres (code 23505).
function fakeRest() {
  const rows = { expenses: [] };
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    calls.push({ method: init.method, table, search: u.search, headers: init.headers });
    const json = (status, body) => new Response(JSON.stringify(body), { status });
    if (init.method === 'POST') {
      const row = JSON.parse(init.body);
      const clash = rows.expenses.some((r) => r.group_id === row.group_id && r.idempotency_key === row.idempotency_key);
      if (clash) return json(409, { code: '23505', message: 'duplicate key' });
      rows[table].push(row);
      return json(201, [row]);
    }
    const key = u.searchParams.get('idempotency_key')?.slice(3);
    return json(200, rows[table].filter((r) => !key || r.idempotency_key === key));
  };
  return { fetchImpl, calls };
}

test('maps camelCase to snake_case, sends the service key, handles duplicate expenses', async () => {
  const { fetchImpl, calls } = fakeRest();
  const repo = createSupabaseRepository({ url: 'https://x.supabase.co/', serviceKey: 'service-key', fetchImpl });
  const e = { id: 'e1', groupId: 'g1', paidBy: 'm1', idempotencyKey: 'key-12345', amount: '1.00' };
  const first = await repo.insertExpense(e);
  assert.deepEqual(first, e);
  assert.equal(calls[0].headers.apikey, 'service-key');
  const again = await repo.insertExpense({ ...e, id: 'e2' });
  assert.equal(again.id, 'e1', 'a repeated idempotency key returns the stored expense');
});

test('intents: the open-intent indexes become INTENT_IN_PROGRESS; recordSettlement is one RPC', async () => {
  const calls = [];
  const answers = [
    [201, [{ id: 'i1', group_id: 'g1', status: 'reserved' }]],
    [409, { code: '23505', message: 'duplicate key value violates unique constraint "one_open_intent_per_creditor"' }],
    [200, { id: 's1', group_id: 'g1', intent_id: 'i1', tx_hash: 'a'.repeat(64) }],
    [409, { code: '23505', message: 'duplicate key value violates unique constraint "settlements_tx_hash_key"' }],
    [400, { code: 'P0001', message: 'INTENT_NOT_OPEN' }],
  ];
  const fetchImpl = async (url, init) => {
    calls.push({ path: new URL(url).pathname, body: init.body && JSON.parse(init.body) });
    const [status, body] = answers.shift();
    return new Response(JSON.stringify(body), { status });
  };
  const repo = createSupabaseRepository({ url: 'https://x.supabase.co', serviceKey: 'k', fetchImpl });

  assert.equal((await repo.insertIntent({ id: 'i1', groupId: 'g1', memoHash: 'b'.repeat(64) })).groupId, 'g1');
  assert.equal(calls[0].body.memo_hash, 'b'.repeat(64));
  await assert.rejects(repo.insertIntent({ id: 'i2', groupId: 'g1' }), { code: 'INTENT_IN_PROGRESS' });

  const s = await repo.recordSettlement({ intentId: 'i1', id: 's1', txHash: 'a'.repeat(64), createdAt: '2026-10-25T17:00:00Z' });
  assert.equal(s.intentId, 'i1');
  assert.equal(calls[2].path, '/rest/v1/rpc/record_settlement');
  assert.deepEqual(Object.keys(calls[2].body).sort(), ['p_created_at', 'p_intent_id', 'p_settlement_id', 'p_tx_hash']);
  await assert.rejects(repo.recordSettlement({ intentId: 'i1', id: 's2', txHash: 'a'.repeat(64) }), { code: 'DUPLICATE_TX' });
  await assert.rejects(repo.recordSettlement({ intentId: 'i1', id: 's3', txHash: 'c'.repeat(64) }), { code: 'INTENT_NOT_OPEN' });
});


test('a database that is down or overloaded is reported as unavailable, other refusals are not', async () => {
  const answer = (status) => async () => new Response(JSON.stringify({ message: 'x' }), { status });
  const repoFor = (status) => createSupabaseRepository({ url: 'https://db.test', serviceKey: 'k', fetchImpl: answer(status) });
  for (const status of [500, 502, 503, 429]) {
    await assert.rejects(() => repoFor(status).getGroup('g'), (err) => err.code === 'SUPABASE_UNAVAILABLE', String(status));
  }
  for (const status of [400, 401, 404]) {
    await assert.rejects(() => repoFor(status).getGroup('g'), (err) => err.code === undefined, String(status));
  }
});
