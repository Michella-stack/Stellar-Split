import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSupabaseRepository } from '../src/repositories/index.js';

// Fake PostgREST: records requests, enforces unique keys like Postgres (code 23505).
function fakeRest() {
  const rows = { expenses: [], settlements: [] };
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    calls.push({ method: init.method, table, search: u.search, headers: init.headers });
    const json = (status, body) => new Response(JSON.stringify(body), { status });
    if (init.method === 'POST') {
      const row = JSON.parse(init.body);
      const clash = table === 'settlements'
        ? rows.settlements.some((r) => r.tx_hash === row.tx_hash)
        : rows.expenses.some((r) => r.group_id === row.group_id && r.idempotency_key === row.idempotency_key);
      if (clash) return json(409, { code: '23505', message: 'duplicate key' });
      rows[table].push(row);
      return json(201, [row]);
    }
    const key = u.searchParams.get('idempotency_key')?.slice(3);
    return json(200, rows[table].filter((r) => !key || r.idempotency_key === key));
  };
  return { fetchImpl, calls };
}

test('maps camelCase to snake_case, sends the service key, handles duplicates', async () => {
  const { fetchImpl, calls } = fakeRest();
  const repo = createSupabaseRepository({ url: 'https://x.supabase.co/', serviceKey: 'service-key', fetchImpl });
  const e = { id: 'e1', groupId: 'g1', paidBy: 'm1', idempotencyKey: 'key-12345', amount: '1.00' };
  const first = await repo.insertExpense(e);
  assert.deepEqual(first, e);
  assert.equal(calls[0].headers.apikey, 'service-key');
  const again = await repo.insertExpense({ ...e, id: 'e2' });
  assert.equal(again.id, 'e1', 'a repeated idempotency key returns the stored expense');

  await repo.insertSettlement({ id: 's1', groupId: 'g1', txHash: 'a'.repeat(64) });
  await assert.rejects(repo.insertSettlement({ id: 's2', groupId: 'g1', txHash: 'a'.repeat(64) }), { code: 'DUPLICATE_TX' });
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
