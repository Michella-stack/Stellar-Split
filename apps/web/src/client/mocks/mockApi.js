// In-memory mock of the Stellar-Split API. Same methods and response shapes as ../http.js.
// State lives per instance and resets on page reload. Balances are derived with @shared, like the server.

import { netBalances, expenseShares, suggestTransfers } from '@shared/balances.js';
import { fromStroops, toStroops, validateAmount } from '@shared/money.js';
import { checkExactSplit } from '@shared/splits.js';
import { containsSecretKey, isValidStellarAddress, looksLikeStellarAddress } from '@shared/validation.js';
import { ApiError } from '../errors.js';
import { initialState } from './data.js';

const dec = (stroops) => fromStroops(stroops, { minDecimals: 2 });
const USDC = { code: 'USDC', issuer: null };

const STORAGE_KEY = 'stellar-split.mock-state';

/**
 * @param {{ delayMs?: number, now?: () => Date, storage?: Storage | null, addresses?: Record<string, string | undefined> }} [options]
 *   storage: when given (sessionStorage in the app), mock data survives a page reload in the same tab.
 *   addresses: member id → real Testnet address, so a demo payment can reach a funded account.
 */
export function createMockApi({ delayMs = 300, now = () => new Date(), storage = null, addresses = {} } = {}) {
  const state = load() ?? initialState();
  for (const [memberId, address] of Object.entries(addresses)) {
    if (!address || !isValidStellarAddress(address)) continue;
    for (const group of state.groups) {
      const member = group.members.find((m) => m.id === memberId);
      if (member) member.address = address;
    }
  }
  let nextId = 1;
  const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${nextId++}`;

  function load() {
    try {
      const saved = storage?.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  function save() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the mock keeps working in memory.
    }
  }

  /** Resolves after the configured delay with a deep copy, so callers never mutate mock state. */
  const reply = (value) => {
    save();
    return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), delayMs));
  };
  const fail = (code, message, status, details) =>
    new Promise((_, reject) => setTimeout(() => reject(new ApiError(code, message, { status, details })), delayMs));

  let pendingAddress = /** @type {string | null} */ (null);

  /** Mock only: the signed-in wallet takes the place of "you" in the fixtures, so the demo data is yours. */
  function becomeMe(address) {
    const previous = state.me.address;
    if (previous === address) return;
    state.me.address = address;
    for (const group of state.groups) {
      for (const member of group.members) if (member.address === previous) member.address = address;
    }
    if (state.agent.ownerAddress === previous) state.agent.ownerAddress = address;
  }

  const findGroup = (groupId) => state.groups.find((g) => g.id === groupId);
  const myMemberId = (group) => group.members.find((m) => m.address === state.me.address)?.id ?? null;

  function balancesOf(group) {
    return netBalances(
      group.members.map((m) => m.id),
      group.expenses,
      group.settlements,
    );
  }

  function summary(group) {
    const me = myMemberId(group);
    const net = balancesOf(group).get(me) ?? 0n;
    const last = [...group.expenses, ...group.settlements].map((x) => x.createdAt).sort().at(-1) ?? group.createdAt;
    return { id: group.id, name: group.name, type: group.type, memberCount: group.members.length, myNet: dec(net), updatedAt: last };
  }

  function detail(group) {
    const me = myMemberId(group);
    const net = balancesOf(group);
    const transfers = suggestTransfers(net);
    return {
      group: { id: group.id, name: group.name, type: group.type, asset: USDC, network: 'testnet', createdAt: group.createdAt },
      members: group.members,
      me,
      balances: [...net].map(([memberId, v]) => ({ memberId, net: dec(v) })),
      myPosition: {
        net: dec(net.get(me) ?? 0n),
        owes: transfers.filter((t) => t.from === me).map((t) => ({ to: t.to, amount: dec(t.amount) })),
        owed: transfers.filter((t) => t.to === me).map((t) => ({ from: t.from, amount: dec(t.amount) })),
      },
      expenseCount: group.expenses.length,
    };
  }

  function withShares(expense) {
    return { ...expense, shares: [...expenseShares(expense)].map(([memberId, v]) => ({ memberId, amount: dec(v) })) };
  }

  return {
    async requestChallenge({ address }) {
      if (!looksLikeStellarAddress(address)) return fail('INVALID_ADDRESS', 'Not a Stellar address', 400);
      pendingAddress = address;
      const { buildChallenge } = await import('./challenge.js');
      return reply({ challengeXdr: buildChallenge(address) });
    },

    async verifyChallenge({ signedXdr }) {
      const { verifyChallenge } = await import('./challenge.js');
      if (!pendingAddress || !verifyChallenge(signedXdr, pendingAddress)) {
        return fail('UNAUTHORIZED', 'Challenge signature is not valid', 401);
      }
      becomeMe(pendingAddress);
      pendingAddress = null;
      const expiresAt = new Date(now().getTime() + 24 * 3600 * 1000).toISOString();
      return reply({ session: { token: `mock-session-${nextId++}`, address: state.me.address, expiresAt } });
    },

    async getMe() {
      return reply(state.me);
    },

    async updateMe(patch) {
      for (const value of Object.values(patch)) {
        if (typeof value === 'string' && containsSecretKey(value)) return fail('SECRET_KEY_REJECTED', 'Input looks like a secret key', 400);
      }
      const allowed = ['displayName', 'homeCurrency', 'email'];
      for (const key of allowed) if (key in patch) state.me[key] = patch[key];
      for (const group of state.groups) {
        const member = group.members.find((m) => m.address === state.me.address);
        if (member) Object.assign(member, { displayName: state.me.displayName, homeCurrency: state.me.homeCurrency });
      }
      return reply(state.me);
    },

    async listGroups() {
      const groups = state.groups.filter((g) => myMemberId(g)).map(summary);
      let owe = 0n;
      let owed = 0n;
      for (const g of groups) {
        const v = toStroops(g.myNet.replace('-', ''));
        if (g.myNet.startsWith('-')) owe += v;
        else owed += v;
      }
      return reply({ groups, totals: { youOwe: dec(owe), youAreOwed: dec(owed) } });
    },

    async createGroup({ name, type }) {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed || trimmed.length > 60) return fail('VALIDATION', 'Name must be 1 to 60 characters', 400, { field: 'name' });
      if (containsSecretKey(trimmed)) return fail('SECRET_KEY_REJECTED', 'Input looks like a secret key', 400);
      if (!['flat', 'trip', 'other'].includes(type)) return fail('VALIDATION', 'Unknown group type', 400, { field: 'type' });
      const group = {
        id: newId('g'),
        name: trimmed,
        type,
        createdAt: now().toISOString(),
        members: [{ id: 'm-you', kind: 'human', address: state.me.address, displayName: state.me.displayName, homeCurrency: state.me.homeCurrency }],
        expenses: [],
        settlements: [],
      };
      state.groups.push(group);
      return reply(detail(group));
    },

    async getGroup(groupId) {
      const group = findGroup(groupId);
      if (!group || !myMemberId(group)) return fail('NOT_FOUND', 'Group not found', 404);
      return reply(detail(group));
    },

    async createInvite(groupId, { address } = {}) {
      const group = findGroup(groupId);
      if (!group) return fail('NOT_FOUND', 'Group not found', 404);
      if (address !== undefined) {
        if (containsSecretKey(address)) return fail('SECRET_KEY_REJECTED', 'That is a secret key, not an address', 400);
        if (!looksLikeStellarAddress(address)) return fail('INVALID_ADDRESS', 'Not a Stellar address', 400);
        if (group.members.some((m) => m.address === address)) return fail('ALREADY_MEMBER', 'Already in the group', 409);
      }
      const code = `${groupId}-${(nextId++).toString(36)}`;
      state.invites[code] = groupId;
      return reply({ inviteUrl: `${globalThis.location?.origin ?? 'http://localhost:5173'}/join/${code}`, code });
    },

    async acceptInvite(code) {
      const groupId = state.invites[code];
      const group = groupId && findGroup(groupId);
      if (!group) return fail('NOT_FOUND', 'Invite not found or expired', 404);
      return reply({ groupId: group.id, alreadyMember: Boolean(myMemberId(group)) });
    },

    async listExpenses(groupId) {
      const group = findGroup(groupId);
      if (!group) return fail('NOT_FOUND', 'Group not found', 404);
      const expenses = [...group.expenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(withShares);
      return reply({ expenses });
    },

    async createExpense(groupId, input) {
      const group = findGroup(groupId);
      if (!group) return fail('NOT_FOUND', 'Group not found', 404);
      const memberIds = new Set(group.members.map((m) => m.id));
      const description = typeof input.description === 'string' ? input.description.trim() : '';
      if (!description) return fail('VALIDATION', 'Description is required', 400, { field: 'description' });
      if (containsSecretKey(description)) return fail('SECRET_KEY_REJECTED', 'Input looks like a secret key', 400);
      const amount = validateAmount(input.amount);
      if (!amount.ok) return fail('VALIDATION', 'Invalid amount', 400, { field: 'amount', code: amount.code });
      if (!memberIds.has(input.paidBy)) return fail('VALIDATION', 'Unknown payer', 400, { field: 'paidBy' });

      const split = input.split;
      if (split?.type === 'equal') {
        if (!split.participants?.length || !split.participants.every((id) => memberIds.has(id))) {
          return fail('VALIDATION', 'Unknown participant', 400, { field: 'split' });
        }
      } else if (split?.type === 'exact') {
        if (!split.shares?.length || !split.shares.every((s) => memberIds.has(s.memberId))) {
          return fail('VALIDATION', 'Unknown participant', 400, { field: 'split' });
        }
        const parsed = split.shares.map((s) => validateAmount(s.amount));
        if (parsed.some((p) => !p.ok && p.code !== 'NOT_POSITIVE')) return fail('VALIDATION', 'Invalid share', 400, { field: 'split' });
        const check = checkExactSplit(amount.stroops, split.shares.map((s) => toStroops(s.amount)));
        if (!check.ok) return fail('SPLIT_MISMATCH', 'Shares do not add up to the amount', 422, { difference: dec(check.difference) });
      } else {
        return fail('VALIDATION', 'Split must be equal or exact', 400, { field: 'split' });
      }

      const expense = {
        id: newId('e'),
        groupId,
        description,
        amount: input.amount,
        paidBy: input.paidBy,
        split,
        source: input.source ?? 'manual',
        createdBy: myMemberId(group),
        createdAt: now().toISOString(),
      };
      group.expenses.push(expense);
      return reply({ expense: withShares(expense) });
    },

    async recordSettlement(groupId, { to, amount, txHash }) {
      const group = findGroup(groupId);
      if (!group) return fail('NOT_FOUND', 'Group not found', 404);
      const from = myMemberId(group);
      if (!group.members.some((m) => m.id === to) || to === from) return fail('VALIDATION', 'Unknown recipient', 400, { field: 'to' });
      if (!/^[0-9a-f]{64}$/.test(txHash ?? '')) return fail('VALIDATION', 'Invalid transaction hash', 400, { field: 'txHash' });
      if (group.settlements.some((s) => s.txHash === txHash)) return fail('VALIDATION', 'Transaction already recorded', 409, { field: 'txHash' });
      const check = validateAmount(amount);
      if (!check.ok) return fail('VALIDATION', 'Invalid amount', 400, { field: 'amount', code: check.code });
      // The real API verifies the transaction on Stellar Testnet before accepting it.
      const settlement = { id: newId('s'), groupId, from, to, amount, txHash, createdAt: now().toISOString() };
      group.settlements.push(settlement);
      return reply({ settlement });
    },

    async listActivity(groupId) {
      const group = findGroup(groupId);
      if (!group) return fail('NOT_FOUND', 'Group not found', 404);
      const items = [
        ...group.expenses.map((e) => ({ type: 'expense', ...withShares(e) })),
        ...group.settlements.map((s) => ({ type: 'settlement', ...s })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return reply({ items });
    },

    async getAgent(agentId) {
      if (agentId !== state.agent.id) return fail('NOT_FOUND', 'Agent not found', 404);
      return reply({ agent: state.agent, pendingApprovals: state.approvals.filter((a) => a.status === 'pending') });
    },

    async updateAgent(agentId, patch) {
      if (agentId !== state.agent.id) return fail('NOT_FOUND', 'Agent not found', 404);
      if (patch.status !== undefined) {
        if (!['active', 'paused'].includes(patch.status)) return fail('VALIDATION', 'Unknown status', 400, { field: 'status' });
        state.agent.status = patch.status;
      }
      if (patch.policy !== undefined) {
        for (const key of ['maxPerPayment', 'approvalAbove', 'dailyCap']) {
          if (key in patch.policy && !validateAmount(patch.policy[key]).ok) return fail('VALIDATION', `Invalid ${key}`, 400, { field: key });
        }
        state.agent.policy = { ...state.agent.policy, ...patch.policy };
      }
      return reply({ agent: state.agent });
    },

    async listAgentActivity(agentId) {
      if (agentId !== state.agent.id) return fail('NOT_FOUND', 'Agent not found', 404);
      return reply({ items: [...state.agentActivity].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    },

    async approve(approvalId) {
      return decide(approvalId, 'approved');
    },

    async reject(approvalId) {
      return decide(approvalId, 'rejected');
    },
  };

  function decide(approvalId, status) {
    const approval = state.approvals.find((a) => a.id === approvalId);
    if (!approval) return fail('NOT_FOUND', 'Approval not found', 404);
    if (approval.status !== 'pending') return fail('VALIDATION', 'Approval already decided', 409);
    approval.status = status;
    const item = state.agentActivity.find((a) => a.approvalId === approvalId);
    if (item) item.status = status;
    if (status === 'approved') {
      // The real agent would now pay from its own wallet and report the transaction.
      state.agent.spentToday = dec(toStroops(state.agent.spentToday) + toStroops(approval.amount));
      state.agent.wallet.balance = dec(toStroops(state.agent.wallet.balance) - toStroops(approval.amount));
    }
    return reply({ approval, agent: state.agent });
  }
}
