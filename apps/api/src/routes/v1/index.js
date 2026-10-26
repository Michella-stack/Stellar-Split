// /v1 routes. Shapes follow apps/web/src/client/README.md. Errors: { error: { code, message, details? } }.

import { decodeAddress } from '../../auth/index.js';
import { ApiError } from '../../services/ledger.js';
import { SCAN_BODY_LIMIT } from '../../services/receipts.js';

const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Sign in first');

/**
 * @returns {Array<[method: string, pattern: RegExp, handler: (ctx: object) => Promise<[number, object]>]>}
 */
export function routes({ auth, ledger, receipts }) {
  const need = (ctx) => ctx.principal ?? (() => { throw unauthorized(); })();
  const human = (ctx) => {
    const p = need(ctx);
    if (p.kind !== 'human') throw new ApiError(403, 'FORBIDDEN', 'Only a signed-in person can manage agent links');
    return p;
  };
  const agentOf = (address, owner) => {
    if (!decodeAddress(address)) throw new ApiError(400, 'INVALID_ADDRESS', 'agentAddress is not a valid Stellar account address');
    if (address === owner.address) throw new ApiError(400, 'VALIDATION', 'An account cannot be its own agent');
    if (!auth.isAgent(address)) throw new ApiError(400, 'AGENT_NOT_REGISTERED', 'This address is not a registered agent');
    return address;
  };
  const ok = (body) => [200, body];
  const created = (body) => [201, body];

  return [
    ['GET', /^\/v1\/health$/, async () => ok({ status: 'ok', network: 'testnet' })],

    ['POST', /^\/v1\/auth\/challenge$/, async ({ body }) => {
      const c = auth.challenge(body?.address);
      if (!c) throw new ApiError(400, 'INVALID_ADDRESS', 'Not a valid Stellar account address');
      return ok(c);
    }],
    ['POST', /^\/v1\/auth\/verify$/, async ({ body }) => {
      const session = await auth.verify(body?.address, body?.challenge, body?.signature);
      if (!session) throw new ApiError(401, 'UNAUTHORIZED', 'Signature, address or challenge is not valid');
      return ok({ session });
    }],

    // Agent linking (ADR 0005). Only a signed-in human can link an agent to themselves.
    ['POST', /^\/v1\/agents\/link\/challenge$/, async (ctx) => {
      const owner = human(ctx);
      const agent = agentOf(ctx.body?.agentAddress, owner);
      return ok(auth.linkChallenge(owner.address, agent));
    }],
    ['POST', /^\/v1\/agents\/link$/, async (ctx) => {
      const owner = human(ctx);
      const agent = agentOf(ctx.body?.agentAddress, owner);
      if (!(await auth.verifyLink(owner.address, agent, ctx.body.message, ctx.body.signature))) {
        throw new ApiError(400, 'LINK_INVALID', 'The link message or signature is not valid, expired or already used');
      }
      return created(await ledger.linkAgent(owner, agent));
    }],
    ['GET', /^\/v1\/me\/agents$/, async (ctx) => ok(await ledger.listAgents(human(ctx)))],
    ['DELETE', /^\/v1\/me\/agents\/(G[A-Z2-7]{55})$/, async (ctx) => {
      await ledger.revokeAgent(human(ctx), ctx.params[0]);
      return [204];
    }],

    ['GET', /^\/v1\/me$/, async (ctx) => ok(await ledger.me(need(ctx)))],
    ['PATCH', /^\/v1\/me$/, async (ctx) => ok(await ledger.updateMe(need(ctx), ctx.body))],

    ['GET', /^\/v1\/groups$/, async (ctx) => ok(await ledger.listGroups(need(ctx)))],
    ['POST', /^\/v1\/groups$/, async (ctx) => created(await ledger.createGroup(need(ctx), ctx.body))],
    ['GET', /^\/v1\/groups\/([\w-]{1,64})$/, async (ctx) => ok(await ledger.getGroup(need(ctx), ctx.params[0]))],
    ['PATCH', /^\/v1\/groups\/([\w-]{1,64})$/, async (ctx) => ok(await ledger.updateGroup(need(ctx), ctx.params[0], ctx.body))],
    ['DELETE', /^\/v1\/groups\/([\w-]{1,64})$/, async (ctx) => ok(await ledger.deleteGroup(need(ctx), ctx.params[0]))],
    ['DELETE', /^\/v1\/groups\/([\w-]{1,64})\/members\/([\w-]{1,64})$/, async (ctx) => {
      await ledger.removeMember(need(ctx), ctx.params[0], ctx.params[1]);
      return [204];
    }],
    ['POST', /^\/v1\/groups\/([\w-]{1,64})\/members$/, async (ctx) => created(await ledger.addMember(need(ctx), ctx.params[0], ctx.body))],
    ['POST', /^\/v1\/groups\/([\w-]{1,64})\/invites$/, async (ctx) => created(await ledger.createInvite(need(ctx), ctx.params[0], ctx.body))],
    ['POST', /^\/v1\/invites\/([\w-]{1,64})\/accept$/, async (ctx) => ok(await ledger.acceptInvite(need(ctx), ctx.params[0]))],

    ['GET', /^\/v1\/groups\/([\w-]{1,64})\/expenses$/, async (ctx) => ok(await ledger.listExpenses(need(ctx), ctx.params[0]))],
    ['POST', /^\/v1\/groups\/([\w-]{1,64})\/expenses$/, async (ctx) =>
      created(await ledger.createExpense(need(ctx), ctx.params[0], ctx.body, ctx.headers['idempotency-key']))],
    ['GET', /^\/v1\/groups\/([\w-]{1,64})\/balances$/, async (ctx) => ok(await ledger.balances(need(ctx), ctx.params[0]))],
    ['POST', /^\/v1\/groups\/([\w-]{1,64})\/settlements$/, async (ctx) => {
      const dryRun = ctx.query.get('dry_run') === 'true';
      const result = await ledger.settle(need(ctx), ctx.params[0], ctx.body, { dryRun });
      return dryRun ? ok(result) : created(result);
    }],
    ['POST', /^\/v1\/groups\/([\w-]{1,64})\/settlements\/intents$/, async (ctx) =>
      created(await ledger.reserveSettlement(need(ctx), ctx.params[0], ctx.body))],
    ['POST', /^\/v1\/groups\/([\w-]{1,64})\/settlements\/intents\/([\w-]{1,64})\/x402$/, async (ctx) => {
      const proto = ctx.headers['x-forwarded-proto']?.split(',')[0] ?? 'http';
      const r = await ledger.x402(need(ctx), ctx.params[0], ctx.params[1], {
        paymentSignature: ctx.headers['payment-signature'],
        resource: `${proto}://${ctx.headers.host}/v1/groups/${ctx.params[0]}/settlements/intents/${ctx.params[1]}/x402`,
      });
      return [r.status, r.body, r.headers];
    }],
    ['POST', /^\/v1\/groups\/([\w-]{1,64})\/settlements\/intents\/([\w-]{1,64})\/cancel$/, async (ctx) =>
      ok(await ledger.cancelSettlement(need(ctx), ctx.params[0], ctx.params[1]))],
    // A photo is far bigger than any other body, so this route has its own limit (the fourth element).
    ['POST', /^\/v1\/groups\/([\w-]{1,64})\/receipts\/scan$/, async (ctx) => ok(await receipts.scan(need(ctx), ctx.params[0], ctx.body)), { maxBody: SCAN_BODY_LIMIT }],
    ['GET', /^\/v1\/groups\/([\w-]{1,64})\/activity$/, async (ctx) => ok(await ledger.activity(need(ctx), ctx.params[0]))],
  ];
}
