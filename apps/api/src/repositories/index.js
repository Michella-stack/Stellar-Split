// Ledger storage. Same interface in memory (tests, local dev) and on Supabase (PostgREST over fetch).
// insertExpense returns the existing row on a repeated (groupId, idempotencyKey). insertIntent throws INTENT_IN_PROGRESS
// when the debtor or the creditor already has a reserved intent in the group. recordSettlement writes the settlement and
// closes its intent together, and throws DUPLICATE_TX or INTENT_NOT_OPEN.

const coded = (code, message) => Object.assign(new Error(message), { code });
const duplicateTx = () => coded('DUPLICATE_TX', 'Settlement already recorded');
const inProgress = () => coded('INTENT_IN_PROGRESS', 'Another settlement is in progress for this debtor or creditor');
const agentLinked = () => coded('AGENT_ALREADY_LINKED', 'This agent is already linked');
const hasHistory = () => coded('HAS_HISTORY', 'The group or member has expenses or payments');
const notOpen = () => coded('INTENT_NOT_OPEN', 'The settlement intent is not open');

export function createMemoryRepository() {
  const t = { users: [], groups: [], members: [], invites: [], expenses: [], settlements: [], intents: [], agentLinks: [] };
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
      return t.groups.filter((g) => ids.has(g.id) && !g.archivedAt).map(copy);
    },
    updateGroup: async (id, patch) => copy(Object.assign(t.groups.find((g) => g.id === id), patch)),
    archiveGroup: async (id, at) => copy(Object.assign(t.groups.find((g) => g.id === id), { archivedAt: at })),
    /** Throws HAS_HISTORY when the group has expenses, payments or settlement intents; the Supabase foreign keys do the same. */
    deleteGroup: async (id) => {
      if (['expenses', 'settlements', 'intents'].some((table) => byGroup(table, id).length > 0)) throw hasHistory();
      t.members = t.members.filter((m) => m.groupId !== id);
      t.invites = t.invites.filter((i) => i.groupId !== id);
      t.groups = t.groups.filter((g) => g.id !== id);
    },
    insertMember: async (m) => (t.members.push(structuredClone(m)), copy(m)),
    /** Throws HAS_HISTORY when an expense, settlement or intent points at the member. */
    deleteMember: async (id) => {
      const used = t.expenses.some((e) => e.paidBy === id || e.createdBy === id) || t.settlements.some((x) => x.from === id || x.to === id) || t.intents.some((i) => i.from === id || i.to === id);
      if (used) throw hasHistory();
      t.members = t.members.filter((m) => m.id !== id);
    },
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
    insertAgentLink: async (l) => {
      if (t.agentLinks.some((x) => x.agentAddress === l.agentAddress && !x.revokedAt)) throw agentLinked();
      t.agentLinks.push(structuredClone({ ...l, revokedAt: null }));
      return copy(t.agentLinks.at(-1));
    },
    getActiveAgentLink: async (agentAddress) => copy(t.agentLinks.find((x) => x.agentAddress === agentAddress && !x.revokedAt)),
    listAgentLinks: async (ownerAddress) => t.agentLinks.filter((x) => x.ownerAddress === ownerAddress).map(copy),
    /** Sets revokedAt on the active link and returns it, or null when there is none. */
    revokeAgentLink: async (ownerAddress, agentAddress, at) => {
      const l = t.agentLinks.find((x) => x.ownerAddress === ownerAddress && x.agentAddress === agentAddress && !x.revokedAt);
      if (l) l.revokedAt = at;
      return copy(l);
    },
    listIntentsByPayer: async (address, since) => {
      const ids = new Set(t.members.filter((m) => m.address === address).map((m) => m.id));
      return t.intents.filter((i) => (i.payerAddress ? i.payerAddress === address : ids.has(i.from)) && i.reservedAt >= since).map(copy);
    },
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
  // 22P02: the id is not a valid uuid, so no such row exists. The memory repository answers null the same way.
  const one = async (table, filter) => {
    try {
      return (await select(table, `${filter}&limit=1`))[0] ?? null;
    } catch (err) {
      if (err.pgCode === '22P02') return null;
      throw err;
    }
  };
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
      // Filtered here rather than in the query, so listing keeps working before migration 005 adds archived_at.
      return ids.length ? (await select('groups', `id=in.(${ids.map(encodeURIComponent).join(',')})`)).filter((g) => !g.archivedAt) : [];
    },
    updateGroup: async (id, patch) => mapKeys((await req('PATCH', `/groups?id=${eq(id)}`, mapKeys(patch, snake), 'return=representation'))?.[0], camel),
    archiveGroup: async (id, at) => mapKeys((await req('PATCH', `/groups?id=${eq(id)}`, { archived_at: at }, 'return=representation'))?.[0], camel),
    // One statement per table. The members delete fails as a whole (23503) when any expense, settlement or intent points at a member.
    deleteGroup: async (id) => {
      try {
        await req('DELETE', `/members?group_id=${eq(id)}`);
        await req('DELETE', `/invites?group_id=${eq(id)}`);
        await req('DELETE', `/groups?id=${eq(id)}`);
      } catch (err) {
        if (err.pgCode === '23503') throw hasHistory();
        throw err;
      }
    },
    insertMember: (m) => insert('members', m),
    deleteMember: async (id) => {
      try {
        await req('DELETE', `/members?id=${eq(id)}`);
      } catch (err) {
        if (err.pgCode === '23503') throw hasHistory();
        throw err;
      }
    },
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
    insertAgentLink: async (l) => {
      try {
        return await insert('agent_links', l);
      } catch (err) {
        if (err.pgCode === '23505') throw agentLinked();
        throw err;
      }
    },
    getActiveAgentLink: (agentAddress) => one('agent_links', `agent_address=${eq(agentAddress)}&revoked_at=is.null`),
    listAgentLinks: (ownerAddress) => select('agent_links', `owner_address=${eq(ownerAddress)}&order=linked_at`),
    revokeAgentLink: async (ownerAddress, agentAddress, at) =>
      mapKeys((await req('PATCH', `/agent_links?owner_address=${eq(ownerAddress)}&agent_address=${eq(agentAddress)}&revoked_at=is.null`, { revoked_at: at }, 'return=representation'))?.[0], camel) ?? null,
    // Every intent paid from this address, in any group, reserved since `since`.
    listIntentsByPayer: async (address, since) => {
      const ids = (await select('members', `address=${eq(address)}`)).map((m) => m.id);
      if (!ids.length) return [];
      return select('settlement_intents', `reserved_at=gte.${encodeURIComponent(since)}&or=(payer_address.eq.${encodeURIComponent(address)},and(payer_address.is.null,from.in.(${ids.map(encodeURIComponent).join(',')})))`);
    },
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
