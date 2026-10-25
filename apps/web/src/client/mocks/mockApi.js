// In-memory mock of the Stellar-Split API. Same methods and response shapes as ../http.js.
// State lives per instance and resets on page reload. Balances are derived with @shared, like the server.

import { netBalances, expenseShares, suggestTransfers } from '@shared/balances.js';
import { fromStroops, toStroops, validateAmount } from '@shared/money.js';
import { checkExactSplit } from '@shared/splits.js';
import { containsSecretKey, isValidStellarAddress, looksLikeStellarAddress } from '@shared/validation.js';
import { ApiError } from '../errors.js';
import { initialState } from './data.js';
import { mockReceiptDraft } from '../../features/expenses/mockReceipt.js';

const dec = (stroops) => fromStroops(stroops, { minDecimals: 2 });
const USDC = { code: 'USDC', issuer: null };
const EURC = { code: 'EURC', issuer: null };
const assetOf = (group) => (group.asset === 'EURC' ? EURC : USDC);

const STORAGE_KEY = 'stellar-split.mock-state';

/** @param {string} text */
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {{ delayMs?: number, now?: () => Date, storage?: Storage | null, addresses?: Record<string, string | undefined> }} [options]
 *   storage: when given (localStorage in the app), mock data is shared by every tab and survives a reload.
 *   addresses: member id → real Testnet address, so a demo payment can reach a funded account.
 *   storageKey: where the state is kept in `storage`. demo: demo mode, where nothing is sent to Stellar. Payments are
 *   marked `demo: true` so the screens never link them to an explorer.
 */
export function createMockApi({ delayMs = 300, now = () => new Date(), storage = null, addresses = {}, storageKey = STORAGE_KEY, demo = false } = {}) {
  const state = load() ?? initialState();
  // Demo mode starts with a finished profile, so the tour does not begin with a form.
  if (demo && !state.me.displayName) Object.assign(state.me, { displayName: 'Alex', homeCurrency: 'EUR' });
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
      const saved = storage?.getItem(storageKey);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  function save() {
    try {
      storage?.setItem(storageKey, JSON.stringify(state));
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

  const pendingChallenges = new Set();
  const idempotent = new Map();
  // Kept in the saved state, like the API's table, so a reservation survives a reload and is shared by tabs.
  const intents = (state.intents ??= []);

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
    return { id: group.id, name: group.name, type: group.type, asset: assetOf(group).code, memberCount: group.members.length, myNet: dec(net), updatedAt: last };
  }

  function detail(group) {
    const me = myMemberId(group);
    const net = balancesOf(group);
    const transfers = suggestTransfers(net);
    return {
      group: { id: group.id, name: group.name, type: group.type, asset: assetOf(group), network: 'testnet', createdAt: group.createdAt },
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
      const { buildChallenge } = await import('./challenge.js');
      const issued = buildChallenge(address);
      pendingChallenges.add(issued.challenge);
      return reply(issued);
    },

    async verifyChallenge({ address, challenge, signature }) {
      const { verifySignedMessage } = await import('./challenge.js');
      // Single use, like the API: a challenge is accepted at most once.
      if (!pendingChallenges.delete(challenge) || !(await verifySignedMessage(address, challenge, signature))) {
        return fail('UNAUTHORIZED', 'Signature, address or challenge is not valid', 401);
      }
      becomeMe(address);
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
      const other = new Map(); // other assets are totalled apart: dollars and euros never add up
      for (const g of groups) {
        const v = toStroops(g.myNet.replace('-', ''));
        if (g.asset === 'USDC') {
          if (g.myNet.startsWith('-')) owe += v;
          else owed += v;
        } else {
          const t = other.get(g.asset) ?? { asset: g.asset, owe: 0n, owed: 0n };
          if (g.myNet.startsWith('-')) t.owe += v;
          else t.owed += v;
          other.set(g.asset, t);
        }
      }
      return reply({
        groups,
        totals: { youOwe: dec(owe), youAreOwed: dec(owed) },
        otherTotals: [...other.values()].map((t) => ({ asset: t.asset, youOwe: dec(t.owe), youAreOwed: dec(t.owed) })),
      });
    },

    async createGroup({ name, type, asset }) {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed || trimmed.length > 60) return fail('VALIDATION', 'Name must be 1 to 60 characters', 400, { field: 'name' });
      if (containsSecretKey(trimmed)) return fail('SECRET_KEY_REJECTED', 'Input looks like a secret key', 400);
      if (!['flat', 'trip', 'other'].includes(type)) return fail('VALIDATION', 'Unknown group type', 400, { field: 'type' });
      if (asset !== undefined && asset !== 'USDC' && asset !== 'EURC') return fail('ASSET_NOT_SUPPORTED', 'Unknown settlement asset', 400, { field: 'asset' });
      const group = {
        id: newId('g'),
        name: trimmed,
        type,
        asset: asset === 'EURC' ? 'EURC' : 'USDC',
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

    async addMember(groupId, { address, displayName } = {}) {
      const group = findGroup(groupId);
      if (!group || !myMemberId(group)) return fail('NOT_FOUND', 'Group not found', 404);
      if (typeof address !== 'string' || containsSecretKey(address)) return fail('SECRET_KEY_REJECTED', 'That is a secret key, not an address', 400);
      if (!isValidStellarAddress(address)) return fail('INVALID_ADDRESS', 'Not a valid Stellar account address', 400);
      if (group.members.some((m) => m.address === address)) return fail('ALREADY_MEMBER', 'This address is already a member', 409);
      const name = typeof displayName === 'string' && displayName.trim() ? displayName.trim().slice(0, 60) : `${address.slice(0, 4)}…${address.slice(-4)}`;
      const member = { id: newId('m'), kind: 'human', displayName: name, address, homeCurrency: 'USD' };
      group.members.push(member);
      return reply({ member });
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

    async scanReceipt(groupId) {
      const group = findGroup(groupId);
      if (!group || !myMemberId(group)) return fail('NOT_FOUND', 'Group not found', 404);
      // The photo is never read in mock mode: every photo gives the same sample draft.
      return reply({ draft: mockReceiptDraft(now()) });
    },

    async createExpense(groupId, input, { idempotencyKey } = {}) {
      const group = findGroup(groupId);
      if (idempotencyKey && idempotent.has(idempotencyKey)) return reply({ expense: idempotent.get(idempotencyKey) });
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
      if (idempotencyKey) idempotent.set(idempotencyKey, withShares(expense));
      return reply({ expense: withShares(expense) });
    },

    // Settling is two steps, like the API: reserve an intent, then record the payment with its id.
    async createSettlementIntent(groupId, { to, amount }) {
      const group = findGroup(groupId);
      if (!group || !myMemberId(group)) return fail('NOT_FOUND', 'Group not found', 404);
      const from = myMemberId(group);
      const recipient = group.members.find((m) => m.id === to);
      if (!recipient || to === from) return fail('VALIDATION', 'to must be another member of the group', 400, { field: 'to' });
      const check = validateAmount(amount);
      if (!check.ok) return fail('VALIDATION', 'Invalid amount', 400, { field: 'amount', code: check.code });
      const open = intents.filter((i) => i.groupId === groupId && i.status === 'reserved' && Date.parse(i.expiresAt) > now().getTime());
      if (open.some((i) => i.from === from || i.to === to || i.from === to || i.to === from)) {
        return fail('INTENT_IN_PROGRESS', 'Another payment with this person is in progress', 409);
      }
      const net = balancesOf(group);
      const debt = -(net.get(from) ?? 0n);
      const credit = net.get(to) ?? 0n;
      const limit = debt < credit ? debt : credit;
      if (debt <= 0n || credit <= 0n || check.stroops > limit) {
        return fail('OVERPAY', 'The amount is more than you owe this member', 422, { youOwe: dec(debt > 0n ? debt : 0n) });
      }
      const id = newId('si');
      const memo = await sha256Hex(`stellar-split:intent:${id}`);
      const intent = {
        id,
        groupId,
        from,
        to,
        amount: dec(check.stroops),
        asset: USDC,
        network: 'stellar:testnet',
        payFrom: group.members.find((m) => m.id === from).address,
        payTo: recipient.address,
        memo: { type: 'hash', value: memo },
        status: 'reserved',
        reservedAt: now().toISOString(),
        expiresAt: new Date(now().getTime() + 10 * 60_000).toISOString(),
      };
      intents.push(intent);
      return reply({ intent });
    },

    async cancelSettlementIntent(groupId, intentId) {
      const intent = intents.find((i) => i.id === intentId && i.groupId === groupId);
      if (!intent) return fail('INTENT_NOT_FOUND', 'Settlement intent not found', 404);
      if (intent.status !== 'reserved') return fail('INTENT_NOT_OPEN', `This settlement intent is ${intent.status}`, 409);
      intent.status = 'cancelled';
      return reply({ intent });
    },

    async recordSettlement(groupId, { intentId, txHash }) {
      const group = findGroup(groupId);
      if (!group) return fail('NOT_FOUND', 'Group not found', 404);
      const intent = intents.find((i) => i.id === intentId && i.groupId === groupId);
      if (!intent) return fail('INTENT_NOT_FOUND', 'Settlement intent not found', 404);
      if (!['reserved', 'expired', 'cancelled'].includes(intent.status)) return fail('INTENT_NOT_OPEN', `This settlement intent is ${intent.status}`, 409);
      const hash = String(txHash ?? '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(hash)) return fail('VALIDATION', 'Invalid transaction hash', 400, { field: 'txHash' });
      if (group.settlements.some((s) => s.txHash === hash)) return fail('DUPLICATE_TX', 'This transaction is already recorded', 409);
      // The money has moved: a cancelled intent keeps the payment for review, as the API does.
      if (intent.status === 'cancelled') return fail('NEEDS_REVIEW', 'The payment arrived but no longer matches an open debt. It is kept for review.', 409, { txHash: hash });
      // The real API also checks on Horizon that the transaction carries the intent's memo and time bounds.
      const settlement = { id: newId('s'), groupId, from: intent.from, to: intent.to, amount: intent.amount, txHash: hash, intentId, createdAt: now().toISOString(), ...(demo ? { demo: true } : {}) };
      group.settlements.push(settlement);
      intent.status = 'settled';
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
