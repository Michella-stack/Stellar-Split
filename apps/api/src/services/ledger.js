// Ledger rules on top of @stellar-split/shared. Every call takes the authenticated principal { kind, address }.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  checkExactSplit,
  convertToStroops,
  currencyOfAsset,
  EXPENSE_CURRENCIES,
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
const MIN_RATE = toStroops('0.001');
const MAX_RATE = toStroops('1000000');
// A reserved intent blocks other settlements for its debtor and creditor until it is paid, cancelled or expires (ADR 0003).
const INTENT_TTL_MS = 10 * 60 * 1000;
const memoFor = (intentId) => createHash('sha256').update(`stellar-split:intent:${intentId}`).digest('hex');
// An expense entered in another currency keeps what was typed and the rate, next to the amount in the group's asset (ADR 0011).
const pub = ({ idempotencyKey, originalAmount, originalCurrency, rate, ...e }) => ({
  ...e,
  ...(originalAmount ? { original: { amount: originalAmount, currency: originalCurrency, rate } } : {}),
});
const fmt = (stroops) => fromStroops(stroops, { minDecimals: 2 });
const invalid = (message, details) => new ApiError(400, 'VALIDATION', message, details);

function text(value, field, max) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) throw invalid(`${field} must be 1 to ${max} characters`);
  return value.trim();
}

/**
 * The amount of a new expense in the group's asset. Normally it is `input.amount`. With `input.original` ({ amount, currency, rate })
 * it is converted here, once, and the original and the rate are kept on the expense; a client that also sends `amount` must have
 * converted it the same way (AMOUNT_RATE_MISMATCH otherwise), so what is stored is always what the rate says.
 * @returns {{ total: bigint, original: { originalAmount: string, originalCurrency: string, rate: string } | null }}
 */
function expenseAmount(input, groupCurrency) {
  if (input.original === undefined || input.original === null) return { total: amountOf(input.amount), original: null };
  const o = input.original;
  const others = EXPENSE_CURRENCIES.filter((c) => c !== groupCurrency);
  if (typeof o !== 'object' || !others.includes(o.currency)) throw invalid(`original.currency must be one of: ${others.join(', ')}`);
  const typed = amountOf(o.amount, 'original.amount');
  const rate = validateAmount(o.rate);
  if (!rate.ok || rate.stroops < MIN_RATE || rate.stroops > MAX_RATE) throw invalid('original.rate must be between 0.001 and 1000000', { field: 'original.rate' });
  const total = convertToStroops(o.amount, o.rate);
  if (total <= 0n || total > MAX_AMOUNT) throw invalid('The converted amount must be positive and within the limit', { field: 'original.amount' });
  if (input.amount !== undefined && input.amount !== fmt(total)) {
    throw new ApiError(400, 'AMOUNT_RATE_MISMATCH', 'amount is not original.amount converted at original.rate', { expected: fmt(total) });
  }
  return { total, original: { originalAmount: fmt(typed), originalCurrency: o.currency, rate: fromStroops(rate.stroops, { minDecimals: 0 }) } };
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
    // An archived group is gone for everyone; its rows stay in the database as history.
    if (!group || group.archivedAt) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
    const [members, expenses, settlements] = await Promise.all([
      repo.listMembers(groupId),
      repo.listExpenses(groupId),
      repo.listSettlements(groupId),
    ]);
    const net = netBalances(members.map((m) => m.id), expenses, settlements);
    return { group, members, expenses, settlements, net };
  }

  function onlyCreator(principal, group) {
    if (group.createdBy !== principal.address) throw new ApiError(403, 'FORBIDDEN', 'Only the person who created the group can do this');
  }

  async function forMember(principal, groupId) {
    const state = await load(groupId);
    const me = state.members.find((m) => m.address === principal.address);
    // Same answer as a missing group, so non-members cannot probe which groups exist.
    if (!me) throw new ApiError(404, 'NOT_FOUND', 'Group not found');
    return { ...state, me };
  }

  /**
   * The settlement asset of a group. Groups settle in USDC unless they were created with another asset (#98).
   * A group whose asset is not configured is refused, never silently treated as USDC.
   */
  function groupAsset(group) {
    if (!group?.asset || group.asset === stellar.asset.code) return stellar.asset;
    const asset = stellar.assetFor?.(group.asset);
    if (!asset) throw new ApiError(503, 'ASSET_UNAVAILABLE', `This group settles in ${group.asset}, which is not configured on this server`);
    return asset;
  }

  function detail({ group, members, expenses, net, me }) {
    const transfers = suggestTransfers(net);
    return {
      group: { ...group, asset: groupAsset(group), network: 'testnet' },
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

  /** The address that must send the payment: the agent for an on-behalf intent, otherwise the debtor. */
  const payerOf = (i, members) => i.payerAddress ?? members.find((m) => m.id === i.from)?.address;

  function publicIntent(i, payer, to, asset = stellar.asset) {
    return {
      id: i.id,
      groupId: i.groupId,
      from: i.from,
      to: i.to,
      amount: i.amount,
      asset,
      network: 'stellar:testnet',
      payFrom: payer,
      payer,
      debtorMemberId: i.from,
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
      const other = new Map(); // totals of groups that settle in another asset, kept apart: dollars and euros never add up
      const out = [];
      const states = await Promise.all(groups.map((g) => load(g.id))); // one round trip per group at a time would not scale
      for (const [i, g] of groups.entries()) {
        const { members, expenses, settlements, net } = states[i];
        const me = members.find((m) => m.address === principal.address);
        const mine = net.get(me.id);
        const code = g.asset ?? stellar.asset.code;
        if (code === stellar.asset.code) {
          if (mine < 0n) owe -= mine;
          else owed += mine;
        } else {
          const t = other.get(code) ?? { asset: code, youOwe: 0n, youAreOwed: 0n };
          if (mine < 0n) t.youOwe -= mine;
          else t.youAreOwed += mine;
          other.set(code, t);
        }
        const last = [...expenses, ...settlements].map((x) => x.createdAt).sort().pop();
        out.push({ id: g.id, name: g.name, type: g.type, asset: code, memberCount: members.length, myNet: fmt(mine), updatedAt: last ?? g.createdAt });
      }
      return {
        groups: out,
        totals: { youOwe: fmt(owe), youAreOwed: fmt(owed) },
        otherTotals: [...other.values()].map((t) => ({ asset: t.asset, youOwe: fmt(t.youOwe), youAreOwed: fmt(t.youAreOwed) })),
      };
    },

    async createGroup(principal, input = {}) {
      const type = ['flat', 'trip', 'other'].includes(input.type) ? input.type : 'other';
      const name = text(input.name, 'name', 80);
      // Optional settlement asset (#98). USDC is the default and is stored as no value, so existing databases need no change for it.
      const asset = input.asset === undefined || input.asset === null ? stellar.asset.code : input.asset;
      if (typeof asset !== 'string' || !(asset === stellar.asset.code || stellar.assetFor?.(asset))) {
        throw new ApiError(400, 'ASSET_NOT_SUPPORTED', `asset must be one of: ${(stellar.supportedAssets?.() ?? [stellar.asset.code]).join(', ')}`);
      }
      const id = randomUUID();
      // Everything that can be refused is checked before the first insert, so a bad request never leaves an empty group.
      const first = await draftMember(id, [], { address: principal.address, displayName: input.displayName, kind: principal.kind });
      const group = await repo.insertGroup({ id, name, type, createdBy: principal.address, createdAt: ts(), ...(asset === stellar.asset.code ? {} : { asset }) });
      const me = await repo.insertMember(first);
      return detail({ ...(await load(group.id)), me });
    },

    /** Resolves when the caller is a member of the group, and answers 404 otherwise (same as a missing group). */
    async requireMember(principal, groupId) {
      await forMember(principal, groupId);
    },

    async getGroup(principal, groupId) {
      return detail(await forMember(principal, groupId));
    },

    async updateGroup(principal, groupId, input = {}) {
      const { group } = await forMember(principal, groupId);
      onlyCreator(principal, group);
      const patch = {};
      if (input.name !== undefined) patch.name = text(input.name, 'name', 80);
      if (input.type !== undefined) {
        if (!['flat', 'trip', 'other'].includes(input.type)) throw invalid('type must be flat, trip or other');
        patch.type = input.type;
      }
      if (Object.keys(patch).length === 0) throw invalid('Send a name or a type to change');
      await repo.updateGroup(groupId, patch);
      return detail(await forMember(principal, groupId));
    },

    /** Deletes a group with no history. With expenses or payments it is archived instead, so the record of them is kept. */
    async deleteGroup(principal, groupId) {
      const { group } = await forMember(principal, groupId);
      onlyCreator(principal, group);
      try {
        await repo.deleteGroup(groupId);
        return { result: 'deleted' };
      } catch (err) {
        if (err.code !== 'HAS_HISTORY') throw err;
        await repo.archiveGroup(groupId, ts());
        return { result: 'archived' };
      }
    },

    /** The creator removes anyone; a member can remove themselves. Only a member with no expenses or payments can go. */
    async removeMember(principal, groupId, memberId) {
      const { group, members, expenses, settlements, me } = await forMember(principal, groupId);
      const target = members.find((m) => m.id === memberId);
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
      if (target.id !== me.id) onlyCreator(principal, group);
      if (target.address === group.createdBy) {
        throw new ApiError(409, 'CREATOR_CANNOT_LEAVE', 'The person who created the group cannot leave it. Delete the group instead');
      }
      const inHistory =
        expenses.some((e) => e.paidBy === memberId || e.createdBy === memberId || e.shares.some((s) => s.memberId === memberId)) ||
        settlements.some((x) => x.from === memberId || x.to === memberId);
      const blocked = () => new ApiError(409, 'MEMBER_HAS_HISTORY', 'This member appears in expenses or payments, so they cannot be removed');
      if (inHistory) throw blocked();
      try {
        await repo.deleteMember(memberId);
      } catch (err) {
        throw err.code === 'HAS_HISTORY' ? blocked() : err;
      }
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
      const target = await repo.getGroup(invite.groupId);
      if (!target || target.archivedAt) throw new ApiError(404, 'NOT_FOUND', 'Invite not found');
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
      const { members, me, group } = await forMember(principal, groupId);
      const ids = new Set(members.map((m) => m.id));
      const { total, original } = expenseAmount(input, currencyOfAsset(group.asset ?? stellar.asset.code));
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
        ...original,
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
      const { group, members, net, me } = await forMember(principal, groupId);
      if (dryRun) {
        const { to, amount } = terms(members, net, me, input);
        await enforceAgentCaps(principal, groupId, amount);
        return { intent: { groupId, from: me.id, to: to.id, amount: fmt(amount), asset: groupAsset(group), network: 'stellar:testnet', payFrom: me.address, payTo: to.address } };
      }

      const intent = typeof input.intentId === 'string' ? await repo.getIntent(input.intentId) : null;
      if (!intent || intent.groupId !== groupId || payerOf(intent, members) !== me.address) {
        throw new ApiError(404, 'INTENT_NOT_FOUND', 'Reserve a settlement intent first: POST /v1/groups/:id/settlements/intents');
      }
      if (input.to !== undefined && input.to !== intent.to) throw invalid('to does not match the settlement intent');
      if (input.amount !== undefined && amountOf(input.amount) !== toStroops(intent.amount)) throw invalid('amount does not match the settlement intent');
      if (!['reserved', 'expired', 'cancelled'].includes(intent.status)) throw new ApiError(409, 'INTENT_NOT_OPEN', `This settlement intent is ${intent.status}`);

      const to = members.find((m) => m.id === intent.to);
      const txHash = String(input.txHash ?? '').toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(txHash)) throw invalid('txHash must be a 64-character hex transaction hash');
      const check = await stellar.verifyPayment({ txHash, from: me.address, to: to.address, amount: intent.amount, memoHash: intent.memoHash, notAfter: intent.expiresAt, asset: groupAsset(group) });
      if (!check.ok) throw new ApiError(422, check.code, check.message);

      // The money has moved. If the intent was cancelled, or an expense changed the debt since the reservation,
      // keep the payment for an operator instead of rejecting it silently or overpaying.
      if (intent.status === 'cancelled' || overpays(net, intent.from, to.id, toStroops(intent.amount))) {
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
      const { group, members, me } = await forMember(principal, groupId);
      const asset = groupAsset(group);
      // An agent may pay a linked owner's debt (ADR 0005): the owner is the debtor, the agent is the payer, and the agent's caps apply.
      let debtor = me;
      if (input.onBehalfOf !== undefined) {
        const owner = members.find((m) => m.id === input.onBehalfOf);
        const link = principal.kind === 'agent' && owner ? await repo.getActiveAgentLink(me.address) : null;
        if (!link || link.ownerAddress !== owner.address) throw new ApiError(403, 'NOT_LINKED', 'This agent is not linked to that member');
        debtor = owner;
      }
      const to = members.find((m) => m.id === input.to);
      if (!to || to.id === debtor.id) throw invalid('to must be another member of the group');
      const amount = amountOf(input.amount);
      const reservedAt = ts();
      await repo.expireIntents(groupId, reservedAt);
      const id = randomUUID();
      const intent = await repo
        .insertIntent({ id, groupId, from: debtor.id, ...(debtor === me ? {} : { payerAddress: me.address }), to: to.id, amount: fmt(amount), memoHash: memoFor(id), reservedAt, expiresAt: new Date(Date.parse(reservedAt) + INTENT_TTL_MS).toISOString() })
        .catch((err) => {
          throw err.code === 'INTENT_IN_PROGRESS' ? new ApiError(409, 'INTENT_IN_PROGRESS', err.message) : err;
        });
      // Balances and agent spending are read after winning the reservation, so no other settlement for these two members can
      // be counted twice, and two reservations by one agent in different groups each see the other.
      const { net } = await load(groupId);
      try {
        terms(members, net, debtor, input);
        await enforceAgentCaps(principal, groupId, amount, id);
      } catch (err) {
        await repo.updateIntent(id, { status: 'cancelled', closedAt: ts() });
        throw err;
      }
      return { intent: publicIntent(intent, me.address, to, asset) };
    },

    /** Cancels a reserved intent, for example when the person rejects the signature in Freighter. Only the payer can. */
    async cancelSettlement(principal, groupId, intentId) {
      const { group, members, me } = await forMember(principal, groupId);
      const intent = await repo.getIntent(intentId);
      if (!intent || intent.groupId !== groupId || payerOf(intent, members) !== me.address) throw new ApiError(404, 'INTENT_NOT_FOUND', 'Settlement intent not found');
      if (intent.status !== 'reserved') throw new ApiError(409, 'INTENT_NOT_OPEN', `This settlement intent is ${intent.status}`);
      const cancelled = await repo.updateIntent(intent.id, { status: 'cancelled', closedAt: ts() });
      return { intent: publicIntent(cancelled, me.address, members.find((m) => m.id === intent.to), groupAsset(group)) };
    },

    /** Links `agentAddress` to the signed-in owner. The caller has already verified the owner's signature (auth.verifyLink). */
    async linkAgent(principal, agentAddress) {
      const link = await repo
        .insertAgentLink({ id: randomUUID(), ownerAddress: principal.address, agentAddress, linkedAt: ts() })
        .catch((err) => {
          throw err.code === 'AGENT_ALREADY_LINKED' ? new ApiError(409, 'AGENT_ALREADY_LINKED', err.message) : err;
        });
      return { agent: { address: link.agentAddress, ownerAddress: link.ownerAddress, linkedAt: link.linkedAt } };
    },

    async listAgents(principal) {
      return { agents: (await repo.listAgentLinks(principal.address)).map((l) => ({ address: l.agentAddress, linkedAt: l.linkedAt, revokedAt: l.revokedAt ?? null })) };
    },

    async revokeAgent(principal, agentAddress) {
      if (!(await repo.revokeAgentLink(principal.address, agentAddress, ts()))) throw new ApiError(404, 'NOT_FOUND', 'No active link to this agent');
    },

    /**
     * x402-style handshake, self-verified (no facilitator). Without a payment, answers the payment terms with status 402.
     * With one, checks the transaction with the same Horizon verifier as POST /settlements and records the settlement.
     * Only the payer of the intent can call it. Returns { status, headers, body }.
     * @param {{ paymentSignature?: string, resource: string }} request
     */
    async x402(principal, groupId, intentId, { paymentSignature, resource }) {
      const { group, members } = await forMember(principal, groupId);
      const intent = await repo.getIntent(intentId);
      if (!intent || intent.groupId !== groupId || payerOf(intent, members) !== principal.address) throw new ApiError(404, 'INTENT_NOT_FOUND', 'Settlement intent not found');
      const asset = groupAsset(group);
      const to = members.find((m) => m.id === intent.to);
      const required = (error) => {
        const secs = Math.floor((Date.parse(intent.expiresAt) - now().getTime()) / 1000);
        const terms = {
          x402Version: 1,
          error,
          accepts: [{
            scheme: 'exact', network: 'stellar:testnet', asset: `${asset.code}:${asset.issuer}`, payTo: to.address, amount: intent.amount,
            maxTimeoutSeconds: Math.max(0, secs), resource,
            extra: { intentId: intent.id, memoType: 'hash', memo: intent.memoHash, expiresAt: intent.expiresAt },
          }],
        };
        return { status: 402, headers: { 'payment-required': Buffer.from(JSON.stringify(terms)).toString('base64') }, body: terms };
      };
      if (!paymentSignature) {
        if (intent.status !== 'reserved' || Date.parse(intent.expiresAt) < now().getTime()) throw new ApiError(409, 'INTENT_NOT_OPEN', `This settlement intent is ${intent.status === 'reserved' ? 'expired' : intent.status}`);
        return required(null);
      }
      let payment;
      try {
        payment = JSON.parse(Buffer.from(paymentSignature, 'base64').toString('utf8'));
      } catch {
        return required('PAYMENT-SIGNATURE is not base64 JSON');
      }
      if (payment?.x402Version !== 1 || payment.scheme !== 'exact' || payment.network !== 'stellar:testnet' || !/^[0-9a-f]{64}$/i.test(payment.payload?.txHash ?? '')) {
        return required('PAYMENT-SIGNATURE must be { x402Version: 1, scheme: "exact", network: "stellar:testnet", payload: { txHash } }');
      }
      try {
        const { settlement } = await this.settle(principal, groupId, { intentId, txHash: payment.payload.txHash });
        const receipt = { success: true, transaction: settlement.txHash, network: 'stellar:testnet' };
        return { status: 200, headers: { 'payment-response': Buffer.from(JSON.stringify(receipt)).toString('base64') }, body: { settlement } };
      } catch (err) {
        // A payment the verifier refuses is a payment not made yet: answer 402 again so the agent can retry. Other refusals keep their code.
        if (err instanceof ApiError && err.status === 422 && intent.status === 'reserved') return required(`${err.code}: ${err.message}`);
        throw err;
      }
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
