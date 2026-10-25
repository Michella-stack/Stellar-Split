// Ledger storage. Same interface in memory (tests, local dev) and on Supabase (PostgREST over fetch).
// insertExpense returns the existing row on a repeated (groupId, idempotencyKey). insertIntent throws INTENT_IN_PROGRESS
// when the debtor or the creditor already has a reserved intent in the group. recordSettlement writes the settlement and
// closes its intent together, and throws DUPLICATE_TX or INTENT_NOT_OPEN.

const coded = (code, message) => Object.assign(new Error(message), { code });
const duplicateTx = () => coded('DUPLICATE_TX', 'Settlement already recorded');
const inProgress = () => coded('INTENT_IN_PROGRESS', 'Another settlement is in progress for this debtor or creditor');
const notOpen = () => coded('INTENT_NOT_OPEN', 'The settlement intent is not open');

export function createMemoryRepository() {
  const t = { users: [], groups: [], members: [], invites: [], expenses: [], settlements: [], intents: [] };
  const nonces = new Set();
  const byGroup = (table, groupId) => t[table].filter((r) => r.groupId === groupId);
  const copy = (r) => (r ? structuredClone(r) : null);

  return {
    useNonce: async (nonce) => !nonces.has(nonce) && Boolean(nonces.add(nonce)),
    getUser: async (address) => copy(t.users.find((u) => u.address === address)),
    saveUser: async (user) => {
      t.users = t.users.filter((u) => u.address !== user.address).concat(structuredClone(user));
      return copy(user);
    },
    insertGroup: async (g) => (t.groups.push(structuredClone(g)), copy(g)),
    getGroup: async (id) => copy(t.groups.find((g) => g.id === id)),
    listGroupsByAddress: async (address) => {
      const ids = new Set(t.members.filter((m) => m.address === address).map((m) => m.groupId));
      return t.groups.filter((g) => ids.has(g.id)).map(copy);
    },
    insertMember: async (m) => (t.members.push(structuredClone(m)), copy(m)),
    listMembers: async (groupId) => byGroup('members', groupId).map(copy),
    insertInvite: async (i) => (t.invites.push(structuredClone(i)), copy(i)),
    getInvite: async (code) => copy(t.invites.find((i) => i.code === code)),
    insertExpense: async (e) => {
      const existing = e.idempotencyKey && t.expenses.find((x) => x.groupId === e.groupId && x.idempotencyKey === e.idempotencyKey);
      if (existing) return copy(existing);
      t.expenses.push(structuredClone(e));
      return copy(e);
    },
    listExpenses: async (groupId) => byGroup('expenses', groupId).map(copy),
    listSettlements: async (groupId) => byGroup('settlements', groupId).map(copy),
    insertIntent: async (i) => {
      const open = byGroup('intents', i.groupId).filter((x) => x.status === 'reserved');
      if (open.some((x) => x.from === i.from || x.to === i.to)) throw inProgress();
      t.intents.push(structuredClone({ ...i, status: 'reserved', txHash: null, closedAt: null }));
      return copy(t.intents.at(-1));
    },
    getIntent: async (id) => copy(t.intents.find((i) => i.id === id)),
    expireIntents: async (groupId, now) => {
      for (const i of byGroup('intents', groupId)) {
        if (i.status === 'reserved' && i.expiresAt < now) Object.assign(i, { status: 'expired', closedAt: now });
      }
    },
    updateIntent: async (id, patch) => {
      const i = t.intents.find((x) => x.id === id);
      Object.assign(i, patch);
      return copy(i);
    },
    recordSettlement: async ({ intentId, id, txHash, createdAt }) => {
      const i = t.intents.find((x) => x.id === intentId);
      if (!i || !['reserved', 'expired'].includes(i.status)) throw notOpen();
      if (t.settlements.some((x) => x.txHash === txHash)) throw duplicateTx();
      const s = { id, groupId: i.groupId, from: i.from, to: i.to, amount: i.amount, txHash, createdAt, intentId };
      t.settlements.push(s);
      Object.assign(i, { status: 'settled', txHash, closedAt: createdAt });
      return copy(s);
    },
  };
}

const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const mapKeys = (o, f) => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v])) : null);

/**
 * Supabase through its REST endpoint, with the service role key (server side only; RLS blocks the anon key).
 * @param {{ url: string, serviceKey: string, fetchImpl?: typeof fetch }} options
 */
export function createSupabaseRepository({ url, serviceKey, fetchImpl = globalThis.fetch }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };

  async function req(method, path, body, prefer) {
    const res = await fetchImpl(base + path, {
      method,
      headers: { ...headers, ...(prefer ? { prefer } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      // 5xx and 429 are the database being unavailable (retryable). Other 4xx are our own request being refused.
      const unavailable = res.status >= 500 || res.status === 429;
      throw Object.assign(new Error(`Supabase ${res.status}: ${data?.message ?? ''}`), { pgCode: data?.code, status: res.status, ...(unavailable ? { code: 'SUPABASE_UNAVAILABLE' } : {}) });
    }
    return data;
  }
  const eq = (v) => `eq.${encodeURIComponent(v)}`;
  const select = async (table, filter) => (await req('GET', `/${table}?select=*&${filter}`)).map((r) => mapKeys(r, camel));
  const one = async (table, filter) => (await select(table, `${filter}&limit=1`))[0] ?? null;
  const insert = async (table, row, prefer = 'return=representation') =>
    mapKeys((await req('POST', `/${table}`, mapKeys(row, snake), prefer))?.[0], camel);

  return {
    useNonce: async (nonce, expiresAt) => {
      try {
        await insert('used_nonces', { nonce, expiresAt }, 'return=minimal');
        return true;
      } catch (err) {
        if (err.pgCode === '23505') return false;
        throw err;
      }
    },
    getUser: (address) => one('users', `address=${eq(address)}`),
    saveUser: (user) => insert('users', user, 'return=representation,resolution=merge-duplicates'),
    insertGroup: (g) => insert('groups', g),
    getGroup: (id) => one('groups', `id=${eq(id)}`),
    listGroupsByAddress: async (address) => {
      const ids = [...new Set((await select('members', `address=${eq(address)}`)).map((m) => m.groupId))];
      return ids.length ? select('groups', `id=in.(${ids.map(encodeURIComponent).join(',')})`) : [];
    },
    insertMember: (m) => insert('members', m),
    listMembers: (groupId) => select('members', `group_id=${eq(groupId)}&order=created_at`),
    insertInvite: (i) => insert('invites', i),
    getInvite: (code) => one('invites', `code=${eq(code)}`),
    insertExpense: async (e) => {
      try {
        return await insert('expenses', e);
      } catch (err) {
        if (err.pgCode !== '23505' || !e.idempotencyKey) throw err;
        return one('expenses', `group_id=${eq(e.groupId)}&idempotency_key=${eq(e.idempotencyKey)}`);
      }
    },
    listExpenses: (groupId) => select('expenses', `group_id=${eq(groupId)}&order=created_at`),
    listSettlements: (groupId) => select('settlements', `group_id=${eq(groupId)}&order=created_at`),
    insertIntent: async (i) => {
      try {
        return await insert('settlement_intents', i);
      } catch (err) {
        if (err.pgCode === '23505' && /one_open_intent/.test(err.message)) throw inProgress();
        throw err;
      }
    },
    getIntent: (id) => one('settlement_intents', `id=${eq(id)}`),
    expireIntents: (groupId, now) =>
      req('PATCH', `/settlement_intents?group_id=${eq(groupId)}&status=eq.reserved&expires_at=lt.${encodeURIComponent(now)}`, { status: 'expired' }, 'return=minimal'),
    updateIntent: async (id, patch) =>
      mapKeys((await req('PATCH', `/settlement_intents?id=${eq(id)}`, mapKeys(patch, snake), 'return=representation'))?.[0], camel),
    // One Postgres transaction (database/migrations/002_settlement_intents.sql).
    recordSettlement: async ({ intentId, id, txHash, createdAt }) => {
      try {
        const row = await req('POST', '/rpc/record_settlement', { p_intent_id: intentId, p_settlement_id: id, p_tx_hash: txHash, p_created_at: createdAt });
        return mapKeys(row, camel);
      } catch (err) {
        if (err.pgCode === '23505') throw duplicateTx();
        if (/INTENT_NOT_(OPEN|FOUND)/.test(err.message)) throw notOpen();
        throw err;
      }
    },
  };
}
