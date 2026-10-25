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

describe('settlements', () => {
  const txHash = 'a'.repeat(64);

  it('records a payment and squares me with Mateo', async () => {
    await api.recordSettlement('casa-alfama', { to: 'm-mateo', amount: '364.60', txHash });
    const { myPosition } = await api.getGroup('casa-alfama');
    expect(myPosition).toEqual({ net: '0.00', owes: [], owed: [] });
    const { items } = await api.listActivity('casa-alfama');
    expect(items[0]).toMatchObject({ type: 'settlement', from: 'm-you', to: 'm-mateo', txHash });
  });

  it('refuses the same transaction hash twice', async () => {
    await api.recordSettlement('casa-alfama', { to: 'm-mateo', amount: '100', txHash });
    await expect(api.recordSettlement('casa-alfama', { to: 'm-mateo', amount: '100', txHash })).rejects.toMatchObject({ status: 409 });
  });
});

describe('Stellar Assist', () => {
  it('returns the policy and a pending approval', async () => {
    const { agent, pendingApprovals } = await api.getAgent('assist');
    expect(agent.policy).toMatchObject({ maxPerPayment: '25.00', approvalAbove: '5.00', dailyCap: '50.00' });
    expect(pendingApprovals).toHaveLength(1);
  });

  it('approves once and refuses a second decision', async () => {
    await api.approve('ap-internet');
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
