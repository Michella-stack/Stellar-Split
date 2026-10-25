import { beforeEach, describe, expect, it } from 'vitest';
import { createMockApi } from './mockApi.js';
import { ApiError } from '../errors.js';
import { toStroops } from '@shared/money.js';

/** @type {ReturnType<typeof createMockApi>} */
let api;
beforeEach(() => {
  api = createMockApi({ delayMs: 0, now: () => new Date('2026-10-25T12:00:00Z') });
});

const byId = (balances) => Object.fromEntries(balances.map((b) => [b.memberId, b.net]));
const total = (values) => values.reduce((sum, v) => sum + (v.startsWith('-') ? -toStroops(v.slice(1)) : toStroops(v)), 0n);

describe('Casa Alfama mock balances', () => {
  it('matches the agreed numbers and sums to zero', async () => {
    const { balances } = await api.getGroup('casa-alfama');
    expect(byId(balances)).toEqual({
      'm-you': '-364.60',
      'm-mateo': '1172.20',
      'm-valentina': '-427.80',
      'm-jake': '-427.80',
      'm-assist': '48.00',
    });
    expect(total(balances.map((b) => b.net))).toBe(0n);
  });

  it('tells me I owe Mateo $364.60', async () => {
    const { me, myPosition } = await api.getGroup('casa-alfama');
    expect(me).toBe('m-you');
    expect(myPosition).toEqual({ net: '-364.60', owes: [{ to: 'm-mateo', amount: '364.60' }], owed: [] });
  });

  it('includes the agent as a member', async () => {
    const { members } = await api.getGroup('casa-alfama');
    expect(members.find((m) => m.kind === 'agent')).toMatchObject({ displayName: 'Stellar Assist', ownerId: 'm-you' });
  });
});

describe('group list', () => {
  it('shows Algarve trip owing me $36.00 and the totals', async () => {
    const { groups, totals } = await api.listGroups();
    expect(groups.map((g) => [g.name, g.memberCount, g.myNet])).toEqual([
      ['Casa Alfama', 5, '-364.60'],
      ['Algarve trip', 6, '36.00'],
    ]);
    expect(totals).toEqual({ youOwe: '364.60', youAreOwed: '36.00' });
  });

  it('suggests Eva pays me the $36.00 in Algarve trip', async () => {
    const { myPosition } = await api.getGroup('algarve-trip');
    expect(myPosition.owed).toEqual([{ from: 'm-eva', amount: '36.00' }]);
  });
});

describe('expenses', () => {
  it('adds an exact split and updates balances', async () => {
    await api.createExpense('casa-alfama', {
      description: 'Internet',
      amount: '30.00',
      paidBy: 'm-you',
      split: { type: 'exact', shares: [{ memberId: 'm-you', amount: '10.00' }, { memberId: 'm-jake', amount: '20.00' }] },
    });
    const { balances } = await api.getGroup('casa-alfama');
    expect(byId(balances)['m-you']).toBe('-344.60');
    expect(byId(balances)['m-jake']).toBe('-447.80');
  });

  it('rejects an exact split that does not add up', async () => {
    const attempt = api.createExpense('casa-alfama', {
      description: 'Internet',
      amount: '30.00',
      paidBy: 'm-you',
      split: { type: 'exact', shares: [{ memberId: 'm-you', amount: '10.00' }] },
    });
    await expect(attempt).rejects.toMatchObject({ code: 'SPLIT_MISMATCH', details: { difference: '20.00' } });
  });

  it('rejects a secret key typed as a description', async () => {
    const attempt = api.createExpense('casa-alfama', {
      description: 'S' + 'B'.repeat(55),
      amount: '1',
      paidBy: 'm-you',
      split: { type: 'equal', participants: ['m-you'] },
    });
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toMatchObject({ code: 'SECRET_KEY_REJECTED' });
  });

  it('rejects more than 7 decimals', async () => {
    const attempt = api.createExpense('casa-alfama', {
      description: 'Tiny',
      amount: '0.00000001',
      paidBy: 'm-you',
      split: { type: 'equal', participants: ['m-you'] },
    });
    await expect(attempt).rejects.toMatchObject({ code: 'VALIDATION', details: { code: 'TOO_MANY_DECIMALS' } });
  });
});

describe('settlements (two steps, like the API)', () => {
  const txHash = 'a'.repeat(64);
  const reserve = (amount = '364.60') => api.createSettlementIntent('casa-alfama', { to: 'm-mateo', amount });

  it('reserves an intent with the creditor address, a hash memo and a 10 minute expiry', async () => {
    const { intent } = await reserve();
    expect(intent).toMatchObject({ to: 'm-mateo', amount: '364.60', status: 'reserved', memo: { type: 'hash' } });
    expect(intent.memo.value).toMatch(/^[0-9a-f]{64}$/);
    expect(Date.parse(intent.expiresAt) - Date.parse('2026-10-25T12:00:00Z')).toBe(10 * 60_000);
  });

  it('records the payment once and squares me with Mateo', async () => {
    const { intent } = await reserve();
    await api.recordSettlement('casa-alfama', { intentId: intent.id, txHash });
    expect((await api.getGroup('casa-alfama')).myPosition).toEqual({ net: '0.00', owes: [], owed: [] });
    const { items } = await api.listActivity('casa-alfama');
    expect(items[0]).toMatchObject({ type: 'settlement', from: 'm-you', to: 'm-mateo', txHash, intentId: intent.id });
    await expect(api.recordSettlement('casa-alfama', { intentId: intent.id, txHash })).rejects.toMatchObject({ code: 'INTENT_NOT_OPEN', status: 409 });
  });

  it('blocks a second payment with the same person while one is reserved', async () => {
    await reserve('100');
    await expect(reserve('50')).rejects.toMatchObject({ code: 'INTENT_IN_PROGRESS', status: 409 });
  });

  it('frees the creditor when the intent is cancelled, and keeps a late payment for review', async () => {
    const { intent } = await reserve('100');
    await api.cancelSettlementIntent('casa-alfama', intent.id);
    await expect(api.recordSettlement('casa-alfama', { intentId: intent.id, txHash })).rejects.toMatchObject({ code: 'NEEDS_REVIEW' });
    expect((await reserve('50')).intent.status).toBe('reserved');
  });

  it('refuses to reserve more than the debt', async () => {
    await expect(reserve('364.61')).rejects.toMatchObject({ code: 'OVERPAY', status: 422 });
  });
});

describe('Stellar Assist', () => {
  it('returns the policy and a pending approval', async () => {
    const { agent, pendingApprovals } = await api.getAgent('assist');
    expect(agent.policy).toMatchObject({ maxPerPayment: '25.00', approvalAbove: '5.00', dailyCap: '50.00' });
    expect(pendingApprovals).toHaveLength(1);
  });

  it('starts not set up, so the first visit shows the intro', async () => {
    expect((await api.getAgent('assist')).agent.status).toBe('inactive');
  });

  it('approves once, counts it against today, and refuses a second decision', async () => {
    const { agent } = await api.approve('ap-internet');
    expect(agent.spentToday).toBe('19.50');
    expect((await api.getAgent('assist')).pendingApprovals).toHaveLength(0);
    await expect(api.reject('ap-internet')).rejects.toMatchObject({ status: 409 });
  });

  it('pauses and resumes', async () => {
    expect((await api.updateAgent('assist', { status: 'paused' })).agent.status).toBe('paused');
    expect((await api.updateAgent('assist', { status: 'active' })).agent.status).toBe('active');
  });
});

describe('isolation', () => {
  it('returns copies, so callers cannot change mock state', async () => {
    const first = await api.getGroup('casa-alfama');
    first.members.length = 0;
    expect((await api.getGroup('casa-alfama')).members).toHaveLength(5);
  });
});

describe('mock sign-in (SEP-53, same format as the API)', () => {
  async function signSep53(keypair, message) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`Stellar Signed Message:\n${message}`)));
    return btoa(String.fromCharCode(...keypair.sign(hash)));
  }

  it('accepts a signed challenge once and makes that wallet "me"', async () => {
    const { Keypair } = await import('@stellar/stellar-sdk');
    const wallet = Keypair.random();
    const address = wallet.publicKey();
    const { challenge } = await api.requestChallenge({ address });
    expect(challenge).toMatch(new RegExp(`^Stellar-Split sign-in\nAddress: ${address}\nNonce: `));
    const signature = await signSep53(wallet, challenge);
    const { session } = await api.verifyChallenge({ address, challenge, signature });
    expect(session.address).toBe(address);
    expect((await api.getGroup('casa-alfama')).me).toBe('m-you');
    await expect(api.verifyChallenge({ address, challenge, signature })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('refuses a signature from another key', async () => {
    const { Keypair } = await import('@stellar/stellar-sdk');
    const address = Keypair.random().publicKey();
    const { challenge } = await api.requestChallenge({ address });
    const signature = await signSep53(Keypair.random(), challenge);
    await expect(api.verifyChallenge({ address, challenge, signature })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('mock persistence', () => {
  it('keeps changes across instances that share a storage', async () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const first = createMockApi({ delayMs: 0, storage });
    await first.updateMe({ displayName: 'Damaris', homeCurrency: 'EUR' });
    const second = createMockApi({ delayMs: 0, storage });
    expect((await second.getMe()).displayName).toBe('Damaris');
  });
});

describe('mock settlement intents persistence', () => {
  it('keeps a reservation across instances that share a storage, and shows what the API shows', async () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const first = createMockApi({ delayMs: 0, storage });
    const { intent } = await first.createSettlementIntent('casa-alfama', { to: 'm-mateo', amount: '50' });
    expect(intent).toMatchObject({ reservedAt: expect.any(String), payFrom: expect.any(String), network: 'stellar:testnet' });
    const second = createMockApi({ delayMs: 0, storage });
    await expect(second.createSettlementIntent('casa-alfama', { to: 'm-mateo', amount: '50' })).rejects.toMatchObject({ code: 'INTENT_IN_PROGRESS' });
    await expect(second.cancelSettlementIntent('casa-alfama', 'si-missing')).rejects.toMatchObject({ code: 'INTENT_NOT_FOUND', status: 404 });
    await second.cancelSettlementIntent('casa-alfama', intent.id);
    await expect(second.cancelSettlementIntent('casa-alfama', intent.id)).rejects.toMatchObject({ code: 'INTENT_NOT_OPEN' });
  });
});

describe('mock address overrides', () => {
  it('lets a real Testnet account play Mateo', async () => {
    const real = 'GAZ2D6UYGDFFORAS3PXOEIZQLVS7ME6VYRANQJNLEELMYIAOUB4PY7NY';
    const mock = createMockApi({ delayMs: 0, addresses: { 'm-mateo': real, 'm-jake': 'not-an-address' } });
    const { members } = await mock.getGroup('casa-alfama');
    expect(members.find((m) => m.id === 'm-mateo').address).toBe(real);
    expect(members.find((m) => m.id === 'm-jake').address).not.toBe('not-an-address');
  });
});

describe('members and idempotency (same behaviour as the API)', () => {
  const address = 'GAZ2D6UYGDFFORAS3PXOEIZQLVS7ME6VYRANQJNLEELMYIAOUB4PY7NY';

  it('adds a member by address, named or shortened, and refuses duplicates', async () => {
    const { member } = await api.addMember('algarve-trip', { address });
    expect(member.displayName).toBe('GAZ2…Y7NY');
    await expect(api.addMember('algarve-trip', { address })).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
    await expect(api.addMember('algarve-trip', { address: address.replace(/Y$/, 'Z') })).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });

  it('returns the first expense when the same idempotency key is retried', async () => {
    const input = { description: 'Taxi', amount: '12', paidBy: 'm-you', split: { type: 'equal', participants: ['m-you', 'm-mateo'] } };
    const first = await api.createExpense('casa-alfama', input, { idempotencyKey: 'k-1' });
    const again = await api.createExpense('casa-alfama', input, { idempotencyKey: 'k-1' });
    expect(again.expense.id).toBe(first.expense.id);
    expect((await api.listExpenses('casa-alfama')).expenses.filter((e) => e.description === 'Taxi')).toHaveLength(1);
  });
});

describe('scanReceipt (receipt scan, issue #87)', () => {
  it('returns a sample draft with the shape of the real API and creates nothing', async () => {
    const before = (await api.listExpenses('casa-alfama')).expenses.length;
    const { draft } = await api.scanReceipt('casa-alfama', { mimeType: 'image/jpeg', imageBase64: '' });
    expect(Object.keys(draft).sort()).toEqual(['currency', 'date', 'items', 'merchant', 'total', 'usdc', 'warnings']);
    expect(draft.date).toBe('2026-10-25');
    expect((await api.listExpenses('casa-alfama')).expenses.length).toBe(before);
  });

  it('answers a group the person is not in like a missing group', async () => {
    await expect(api.scanReceipt('no-such-group', {})).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('demo mode (sample data, nothing sent to Stellar)', () => {
  it('starts with a finished profile, so the tour does not open with a form', async () => {
    const demo = createMockApi({ delayMs: 0, demo: true });
    expect(await demo.getMe()).toMatchObject({ displayName: 'Alex', homeCurrency: 'EUR' });
    expect((await api.getMe()).displayName).toBeNull();
  });

  it('marks settlements as demo, so no screen links them to an explorer', async () => {
    const demo = createMockApi({ delayMs: 0, demo: true });
    const { intent } = await demo.createSettlementIntent('casa-alfama', { to: 'm-mateo', amount: '100' });
    const { settlement } = await demo.recordSettlement('casa-alfama', { intentId: intent.id, txHash: 'e'.repeat(64) });
    expect(settlement.demo).toBe(true);
    const normal = createMockApi({ delayMs: 0 });
    const reserved = await normal.createSettlementIntent('casa-alfama', { to: 'm-mateo', amount: '100' });
    expect((await normal.recordSettlement('casa-alfama', { intentId: reserved.intent.id, txHash: 'f'.repeat(64) })).settlement.demo).toBeUndefined();
  });

  it('keeps its state under its own storage key', async () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const demo = createMockApi({ delayMs: 0, demo: true, storage, storageKey: 'demo-key' });
    await demo.updateMe({ displayName: 'Sam' });
    expect([...store.keys()]).toEqual(['demo-key']);
  });
});

describe('EURC groups', () => {
  it('creates a group that settles in euros, with its own totals', async () => {
    const { group } = await api.createGroup({ name: 'Lisbon euros', type: 'trip', asset: 'EURC' });
    expect(group.asset).toMatchObject({ code: 'EURC' });
    const { groups, totals, otherTotals } = await api.listGroups();
    expect(groups.find((g) => g.name === 'Lisbon euros')).toMatchObject({ asset: 'EURC' });
    expect(totals).toEqual({ youOwe: '364.60', youAreOwed: '36.00' });
    expect(otherTotals).toEqual([{ asset: 'EURC', youOwe: '0.00', youAreOwed: '0.00' }]);
  });

  it('defaults to USDC and rejects an unknown asset', async () => {
    const created = await api.createGroup({ name: 'Dollars', type: 'flat' });
    expect(created.group.asset).toMatchObject({ code: 'USDC' });
    await expect(api.createGroup({ name: 'Yen', type: 'flat', asset: 'JPY' })).rejects.toMatchObject({ code: 'ASSET_NOT_SUPPORTED' });
  });
});
