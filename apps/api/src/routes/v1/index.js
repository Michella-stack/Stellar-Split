// /v1 routes. Shapes follow apps/web/src/client/README.md. Errors: { error: { code, message, details? } }.

import { ApiError } from '../../services/ledger.js';

const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Sign in first');

/**
 * @returns {Array<[method: string, pattern: RegExp, handler: (ctx: object) => Promise<[number, object]>]>}
 */
export function routes({ auth, ledger }) {
  const need = (ctx) => ctx.principal ?? (() => { throw unauthorized(); })();
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

    ['GET', /^\/v1\/me$/, async (ctx) => ok(await ledger.me(need(ctx)))],
    ['PATCH', /^\/v1\/me$/, async (ctx) => ok(await ledger.updateMe(need(ctx), ctx.body))],

    ['GET', /^\/v1\/groups$/, async (ctx) => ok(await ledger.listGroups(need(ctx)))],
    ['POST', /^\/v1\/groups$/, async (ctx) => created(await ledger.createGroup(need(ctx), ctx.body))],
    ['GET', /^\/v1\/groups\/([\w-]{1,64})$/, async (ctx) => ok(await ledger.getGroup(need(ctx), ctx.params[0]))],
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
    ['POST', /^\/v1\/groups\/([\w-]{1,64})\/settlements\/intents\/([\w-]{1,64})\/cancel$/, async (ctx) =>
      ok(await ledger.cancelSettlement(need(ctx), ctx.params[0], ctx.params[1]))],
    ['GET', /^\/v1\/groups\/([\w-]{1,64})\/activity$/, async (ctx) => ok(await ledger.activity(need(ctx), ctx.params[0]))],
  ];
}
