// Ledger rules on top of @stellar-split/shared. Every call takes the authenticated principal { kind, address }.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  checkExactSplit,
  expenseShares,
  fromStroops,
  netBalances,
  suggestTransfers,
  toStroops,
  validateAmount,
} from '../../../../packages/shared/src/index.js';
import { checkSpend, DEFAULT_CAPS } from '../../../../packages/policy-engine/src/index.js';
import { decodeAddress } from '../auth/index.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

const MAX_AMOUNT = toStroops('1000000000000');
const MAX_MEMBERS = 50;
// A reserved intent blocks other settlements for its debtor and creditor until it is paid, cancelled or expires (ADR 0003).
const INTENT_TTL_MS = 10 * 60 * 1000;
const memoFor = (intentId) => createHash('sha256').update(`stellar-split:intent:${intentId}`).digest('hex');
const pub = ({ idempotencyKey, ...e }) => e;
const fmt = (stroops) => fromStroops(stroops, { minDecimals: 2 });
const invalid = (message, details) => new ApiError(400, 'VALIDATION', message, details);

function text(value, field, max) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) throw invalid(`${field} must be 1 to ${max} characters`);
  return value.trim();
}

function amountOf(value, field = 'amount') {
  const r = validateAmount(value, { max: MAX_AMOUNT });
  if (!r.ok) throw invalid(`${field}: ${r.code}`, { field, reason: r.code });
  return r.stroops;
}

/**
 * @param {{ repo: object, stellar: object, appUrl?: string, now?: () => Date, agentCaps?: object, log?: (line: object) => void }} deps
 */
export function createLedger({ repo, stellar, appUrl = '', now = () => new Date(), agentCaps = DEFAULT_CAPS, log = () => {} }) {
  const ts = () => now().toISOString();

  async function load(groupId) {
    const group = await repo.getGroup(groupId);
    if (!group) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
    const [members, expenses, settlements] = await Promise.all([
      repo.listMembers(groupId),
      repo.listExpenses(groupId),
      repo.listSettlements(groupId),
    ]);
    const net = netBalances(members.map((m) => m.id), expenses, settlements);
    return { group, members, expenses, settlements, net };
  }

  async function forMember(principal, groupId) {
    const state = await load(groupId);
    const me = state.members.find((m) => m.address === principal.address);
    // Same answer as a missing group, so non-members cannot probe which groups exist.
    if (!me) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
    return { ...state, me };
  }

  function detail({ group, members, expenses, net, me }) {
    const transfers = suggestTransfers(net);
    return {
      group: { ...group, asset: stellar.asset, network: 'testnet' },
      members,
      me: me.id,
      balances: members.map((m) => ({ memberId: m.id, net: fmt(net.get(m.id)) })),
      myPosition: {
        net: fmt(net.get(me.id)),
        owes: transfers.filter((t) => t.from === me.id).map((t) => ({ to: t.to, amount: fmt(t.amount) })),
        owed: transfers.filter((t) => t.to === me.id).map((t) => ({ from: t.from, amount: fmt(t.amount) })),
      },
      expenseCount: expenses.length,
    };
  }

  /** Checks a payment from `me` against the current balances. Throws OVERPAY when it is more than what is owed. */
  function terms(members, net, me, input) {
    const to = members.find((m) => m.id === input.to);
    if (!to || to.id === me.id) throw invalid('to must be another member of the group');
    const amount = amountOf(input.amount);
    if (overpays(net, me.id, to.id, amount)) {
      const debt = -net.get(me.id);
      const credit = net.get(to.id);
      throw new ApiError(422, 'OVERPAY', 'The amount is more than you owe this member', { youOwe: fmt(debt > 0n ? debt : 0n), theyAreOwed: fmt(credit > 0n ? credit : 0n) });
    }
    return { to, amount };
  }

  function overpays(net, fromId, toId, amount) {
    const debt = -net.get(fromId);
    const credit = net.get(toId);
    return debt <= 0n || credit <= 0n || amount > (debt < credit ? debt : credit);
  }

  /**
   * PRD 7.4 spend caps for agents, enforced here so that no limit depends on the agent behaving (#13). Counts the agent's
   * intents in every group over the last 30 days. `exceptId` leaves out the reservation being checked.
   */
  async function enforceAgentCaps(principal, groupId, amount, exceptId) {
    if (principal.kind !== 'agent') return;
    const since = new Date(now().getTime() - 30 * 24 * 3600_000).toISOString();
    const committed = (await repo.listIntentsByPayer(principal.address, since))
      .filter((i) => i.id !== exceptId)
      .map((i) => ({ amount: i.amount, at: i.reservedAt, status: i.status }));
    const decision = checkSpend({ amount, committed, caps: agentCaps, now: now() });
    if (decision.ok) return;
    log({ t: ts(), level: 'warn', msg: 'agent_spend_denied', agent: principal.address, groupId, amount: fmt(amount), code: decision.code, ...decision.details });
    throw new ApiError(403, decision.code, decision.message, decision.details);
  }

  function publicIntent(i, me, to) {
    return {
      id: i.id,
      groupId: i.groupId,
      from: i.from,
      to: i.to,
      amount: i.amount,
      asset: stellar.asset,
      network: 'stellar:testnet',
      payFrom: me.address,
      payTo: to.address,
      memo: { type: 'hash', value: i.memoHash },
      status: i.status,
      reservedAt: i.reservedAt,
      expiresAt: i.expiresAt,
    };
  }

  // Validates and builds the member row without writing anything, so callers can check input before their first insert.
  async function draftMember(groupId, existing, { address, displayName, kind }) {
    if (!decodeAddress(address)) throw new ApiError(400, 'INVALID_ADDRESS', 'Not a valid Stellar account address');
    if (existing.some((m) => m.address === address)) throw new ApiError(409, 'ALREADY_MEMBER', 'This address is already a member');
    if (existing.length >= MAX_MEMBERS) throw invalid(`A group has at most ${MAX_MEMBERS} members`);
    const user = await repo.getUser(address);
    return {
      id: randomUUID(),
      groupId,
      kind: kind === 'agent' ? 'agent' : 'human',
      displayName: displayName ? text(displayName, 'displayName', 60) : user?.displayName ?? `${address.slice(0, 4)}…${address.slice(-4)}`,
      address,
      homeCurrency: user?.homeCurrency ?? 'USD',
      createdAt: ts(),
    };
  }

  const addMemberRow = async (groupId, existing, input) => repo.insertMember(await draftMember(groupId, existing, input));

  return {
    async me(principal) {
      return (await repo.getUser(principal.address)) ?? { address: principal.address, displayName: null, homeCurrency: 'USD', email: null };
    },

    async updateMe(principal, patch = {}) {
      const current = await this.me(principal);
      const next = { ...current };
      if (patch.displayName !== undefined) next.displayName = text(patch.displayName, 'displayName', 60);
      if (patch.homeCurrency !== undefined) {
        if (typeof patch.homeCurrency !== 'string' || !/^[A-Z]{3}$/.test(patch.homeCurrency)) throw invalid('homeCurrency must be a 3-letter code');
        next.homeCurrency = patch.homeCurrency;
      }
      if (patch.email !== undefined) {
        if (patch.email !== null && (typeof patch.email !== 'string' || !/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(patch.email))) throw invalid('email is not valid');
        next.email = patch.email;
      }
      return repo.saveUser(next);
    },

    async listGroups(principal) {
      const groups = await repo.listGroupsByAddress(principal.address);
      let owe = 0n;
      let owed = 0n;
      const out = [];
      const states = await Promise.all(groups.map((g) => load(g.id))); // one round trip per group at a time would not scale
      for (const [i, g] of groups.entries()) {
        const { members, expenses, settlements, net } = states[i];
        const me = members.find((m) => m.address === principal.address);
        const mine = net.get(me.id);
        if (mine < 0n) owe -= mine;
        else owed += mine;
        const last = [...expenses, ...settlements].map((x) => x.createdAt).sort().pop();
        out.push({ id: g.id, name: g.name, type: g.type, memberCount: members.length, myNet: fmt(mine), updatedAt: last ?? g.createdAt });
      }
      return { groups: out, totals: { youOwe: fmt(owe), youAreOwed: fmt(owed) } };
    },

    async createGroup(principal, input = {}) {
      const type = ['flat', 'trip', 'other'].includes(input.type) ? input.type : 'other';
      const name = text(input.name, 'name', 80);
      const id = randomUUID();
      // Everything that can be refused is checked before the first insert, so a bad request never leaves an empty group.
      const first = await draftMember(id, [], { address: principal.address, displayName: input.displayName, kind: principal.kind });
      const group = await repo.insertGroup({ id, name, type, createdBy: principal.address, createdAt: ts() });
      const me = await repo.insertMember(first);
      return detail({ ...(await load(group.id)), me });
    },

    async getGroup(principal, groupId) {
      return detail(await forMember(principal, groupId));
    },

    async addMember(principal, groupId, input = {}) {
      const { members } = await forMember(principal, groupId);
      return { member: await addMemberRow(groupId, members, input) };
    },

    async createInvite(principal, groupId, input = {}) {
      await forMember(principal, groupId);
      if (input.address !== undefined && input.address !== null && !decodeAddress(input.address)) {
        throw new ApiError(400, 'INVALID_ADDRESS', 'Not a valid Stellar account address');
      }
      const code = randomBytes(9).toString('base64url');
      await repo.insertInvite({ code, groupId, address: input.address ?? null, createdBy: principal.address, createdAt: ts() });
      return { inviteUrl: `${appUrl.replace(/\/+$/, '')}/invite/${code}`, code };
    },

    async acceptInvite(principal, code) {
      const invite = typeof code === 'string' ? await repo.getInvite(code) : null;
      if (!invite || (invite.address && invite.address !== principal.address)) throw new ApiError(404, 'NOT_FOUND', 'Invite not found');
      const members = await repo.listMembers(invite.groupId);
      if (members.some((m) => m.address === principal.address)) return { groupId: invite.groupId, alreadyMember: true };
      await addMemberRow(invite.groupId, members, { address: principal.address, kind: principal.kind });
      return { groupId: invite.groupId, alreadyMember: false };
    },

    async listExpenses(principal, groupId) {
      const { expenses } = await forMember(principal, groupId);
      return { expenses: expenses.map(pub).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) };
    },

    async createExpense(principal, groupId, input = {}, idempotencyKey) {
      const { members, me } = await forMember(principal, groupId);
      const ids = new Set(members.map((m) => m.id));
      const total = amountOf(input.amount);
      if (!ids.has(input.paidBy)) throw invalid('paidBy must be a member of the group');
      const split = input.split ?? {};
      let clean;
      if (split.type === 'equal') {
        const p = split.participants;
        if (!Array.isArray(p) || p.length === 0 || p.some((id) => !ids.has(id)) || new Set(p).size !== p.length) {
          throw invalid('participants must be distinct members of the group');
        }
        clean = { type: 'equal', participants: p };
      } else if (split.type === 'exact') {
        const s = split.shares;
        if (!Array.isArray(s) || s.length === 0 || s.some((x) => !ids.has(x?.memberId)) || new Set(s.map((x) => x.memberId)).size !== s.length) {
          throw invalid('shares must name distinct members of the group');
        }
        const amounts = s.map((x, i) => {
          const r = validateAmount(x.amount, { max: MAX_AMOUNT });
          if (!r.ok && r.code !== 'NOT_POSITIVE') throw invalid(`shares[${i}].amount: ${r.code}`);
          return toStroops(x.amount);
        });
        const check = checkExactSplit(total, amounts);
        if (!check.ok) throw new ApiError(422, 'SPLIT_MISMATCH', 'Exact shares must add up to the amount', { difference: fmt(check.difference) });
        clean = { type: 'exact', shares: s.map((x) => ({ memberId: x.memberId, amount: x.amount })) };
      } else {
        throw invalid('split.type must be equal or exact');
      }
      if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) throw invalid('Idempotency-Key must be 8 to 64 letters, digits, - or _');
      const amount = fmt(total);
      const shares = [...expenseShares({ amount, paidBy: input.paidBy, split: clean })].map(([memberId, v]) => ({ memberId, amount: fmt(v) }));
      const source = principal.kind === 'agent' ? 'agent' : ['manual', 'scan'].includes(input.source) ? input.source : 'manual';
      const expense = await repo.insertExpense({
        id: randomUUID(),
        groupId,
        description: text(input.description, 'description', 200),
        amount,
        paidBy: input.paidBy,
        split: clean,
        shares,
        source,
        createdBy: me.id,
        createdAt: ts(),
        idempotencyKey: idempotencyKey ?? null,
      });
      return { expense: pub(expense) };
    },

    async balances(principal, groupId) {
      const { members, net } = await forMember(principal, groupId);
      return { balances: members.map((m) => ({ memberId: m.id, displayName: m.displayName, address: m.address, kind: m.kind, net: fmt(net.get(m.id)) })) };
    },

    /**
     * Without dryRun, records the payment for a reserved intent once Stellar Testnet confirms it. The caller is the payer.
     * With dryRun, returns the payment terms (who to pay, how much, which asset) without reserving or recording anything.
     */
    async settle(principal, groupId, input = {}, { dryRun = false } = {}) {
      const { members, net, me } = await forMember(principal, groupId);
      if (dryRun) {
        const { to, amount } = terms(members, net, me, input);
        await enforceAgentCaps(principal, groupId, amount);
        return { intent: { groupId, from: me.id, to: to.id, amount: fmt(amount), asset: stellar.asset, network: 'stellar:testnet', payFrom: me.address, payTo: to.address } };
      }

      const intent = typeof input.intentId === 'string' ? await repo.getIntent(input.intentId) : null;
      if (!intent || intent.groupId !== groupId || intent.from !== me.id) {
        throw new ApiError(404, 'INTENT_NOT_FOUND', 'Reserve a settlement intent first: POST /v1/groups/:id/settlements/intents');
      }
      if (input.to !== undefined && input.to !== intent.to) throw invalid('to does not match the settlement intent');
      if (input.amount !== undefined && amountOf(input.amount) !== toStroops(intent.amount)) throw invalid('amount does not match the settlement intent');
      if (!['reserved', 'expired', 'cancelled'].includes(intent.status)) throw new ApiError(409, 'INTENT_NOT_OPEN', `This settlement intent is ${intent.status}`);

      const to = members.find((m) => m.id === intent.to);
      const txHash = String(input.txHash ?? '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(txHash)) throw invalid('txHash must be a 64-character hex transaction hash');
      const check = await stellar.verifyPayment({ txHash, from: me.address, to: to.address, amount: intent.amount, memoHash: intent.memoHash, notAfter: intent.expiresAt });
      if (!check.ok) throw new ApiError(422, check.code, check.message);

      // The money has moved. If the intent was cancelled, or an expense changed the debt since the reservation,
      // keep the payment for an operator instead of rejecting it silently or overpaying.
      if (intent.status === 'cancelled' || overpays(net, me.id, to.id, toStroops(intent.amount))) {
        await repo.updateIntent(intent.id, { status: 'needs_review', txHash, closedAt: ts() });
        throw new ApiError(409, 'NEEDS_REVIEW', 'The payment arrived but no longer matches an open debt. It is kept for review.', { txHash });
      }
      const settlement = await repo.recordSettlement({ intentId: intent.id, id: randomUUID(), txHash, createdAt: ts() }).catch((err) => {
        if (err.code === 'DUPLICATE_TX') throw new ApiError(409, 'DUPLICATE_TX', 'This transaction is already recorded');
        if (err.code === 'INTENT_NOT_OPEN') throw new ApiError(409, 'INTENT_NOT_OPEN', err.message);
        throw err;
      });
      return { settlement, explorerUrl: stellar.explorerTx(txHash) };
    },

    /**
     * Reserves a settlement intent: step 1 of a payment, before anything is signed. While it is reserved, nobody else can
     * settle with this debtor or this creditor in the group, so the debt checked here cannot change under the payment.
     * The transaction must carry `memo` as a MEMO_HASH and expire (time bounds) no later than `expiresAt`.
     */
    async reserveSettlement(principal, groupId, input = {}) {
      const { members, me } = await forMember(principal, groupId);
      const to = members.find((m) => m.id === input.to);
      if (!to || to.id === me.id) throw invalid('to must be another member of the group');
      const amount = amountOf(input.amount);
      const reservedAt = ts();
      await repo.expireIntents(groupId, reservedAt);
      const id = randomUUID();
      const intent = await repo
        .insertIntent({ id, groupId, from: me.id, to: to.id, amount: fmt(amount), memoHash: memoFor(id), reservedAt, expiresAt: new Date(Date.parse(reservedAt) + INTENT_TTL_MS).toISOString() })
        .catch((err) => {
          throw err.code === 'INTENT_IN_PROGRESS' ? new ApiError(409, 'INTENT_IN_PROGRESS', err.message) : err;
        });
      // Balances and agent spending are read after winning the reservation, so no other settlement for these two members can
      // be counted twice, and two reservations by one agent in different groups each see the other.
      const { net } = await load(groupId);
      try {
        terms(members, net, me, input);
        await enforceAgentCaps(principal, groupId, amount, id);
      } catch (err) {
        await repo.updateIntent(id, { status: 'cancelled', closedAt: ts() });
        throw err;
      }
      return { intent: publicIntent(intent, me, to) };
    },

    /** Cancels a reserved intent, for example when the person rejects the signature in Freighter. Only the payer can. */
    async cancelSettlement(principal, groupId, intentId) {
      const { members, me } = await forMember(principal, groupId);
      const intent = await repo.getIntent(intentId);
      if (!intent || intent.groupId !== groupId || intent.from !== me.id) throw new ApiError(404, 'INTENT_NOT_FOUND', 'Settlement intent not found');
      if (intent.status !== 'reserved') throw new ApiError(409, 'INTENT_NOT_OPEN', `This settlement intent is ${intent.status}`);
      const cancelled = await repo.updateIntent(intent.id, { status: 'cancelled', closedAt: ts() });
      return { intent: publicIntent(cancelled, me, members.find((m) => m.id === intent.to)) };
    },

    async activity(principal, groupId) {
      const { expenses, settlements } = await forMember(principal, groupId);
      const items = [
        ...expenses.map((e) => ({ ...pub(e), type: 'expense' })),
        ...settlements.map((s) => ({ ...s, type: 'settlement', explorerUrl: stellar.explorerTx(s.txHash) })),
      ];
      return { items: items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) };
    },
  };
}
