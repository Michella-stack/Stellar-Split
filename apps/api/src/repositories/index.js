// Ledger storage. Same interface in memory (tests, local dev) and on Supabase (PostgREST over fetch).
// insertExpense returns the existing row on a repeated (groupId, idempotencyKey); insertSettlement throws DUPLICATE_TX.

const duplicateTx = () => Object.assign(new Error('Settlement already recorded'), { code: 'DUPLICATE_TX' });

export function createMemoryRepository() {
  const t = { users: [], groups: [], members: [], invites: [], expenses: [], settlements: [] };
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
    insertSettlement: async (s) => {
      if (t.settlements.some((x) => x.txHash === s.txHash)) throw duplicateTx();
      t.settlements.push(structuredClone(s));
      return copy(s);
    },
    listSettlements: async (groupId) => byGroup('settlements', groupId).map(copy),
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
    if (!res.ok) throw Object.assign(new Error(`Supabase ${res.status}: ${data?.message ?? ''}`), { pgCode: data?.code, status: res.status });
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
    insertSettlement: async (s) => {
      try {
        return await insert('settlements', s);
      } catch (err) {
        if (err.pgCode === '23505') throw duplicateTx();
        throw err;
      }
    },
    listSettlements: (groupId) => select('settlements', `group_id=${eq(groupId)}&order=created_at`),
  };
}
