import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Stellar secret keys must never pass through the model or the API (docs/BUILD-FOCUS.md).
const SECRET_KEY = /S[A-Z2-7]{55}/;

const noSecret = (v) => !SECRET_KEY.test(v);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "invalid id").refine(noSecret, "looks like a Stellar secret key");
const amount = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,7})?$/, "amount must be a positive decimal with at most 7 decimals")
  .refine((v) => toUnits(v) > 0n, "amount must be greater than zero");
const idempotencyKey = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/).refine(noSecret, "looks like a Stellar secret key");
const text = (max) => z.string().min(1).max(max).refine(noSecret, "looks like a Stellar secret key");

// 7 decimals, like USDC on Stellar. BigInt avoids float rounding in the sum check.
export function toUnits(v) {
  const [whole, frac = ""] = v.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, "0"));
}

// Each member may appear once in a split, as the API requires. A payer outside the split stays valid:
// someone can pay for the others without taking a share.
const distinct = (values) => new Set(values).size === values.length;

const split = z.discriminatedUnion("rule", [
  z.object({
    rule: z.literal("equal"),
    participants: z.array(id).min(1).max(50).refine(distinct, "each participant may appear only once"),
  }),
  z.object({
    rule: z.literal("exact"),
    shares: z
      .array(z.object({ member: id, amount }))
      .min(1)
      .max(50)
      .refine((shares) => distinct(shares.map((x) => x.member)), "each member may have only one share"),
  }),
]);

const reply = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (error, status = 0) => ({
  isError: true,
  content: [{ type: "text", text: JSON.stringify({ status, error }) }],
});
const fromApi = (r) => (r.ok ? reply(r.data) : fail(r.error, r.status));

export function buildServer(api, { settler } = {}) {
  const server = new McpServer({ name: "ledgerly", version: "0.1.0" });
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

  server.registerTool(
    "ledgerly_list_groups",
    { title: "List groups", description: "Groups this agent belongs to. Does not spend money.", inputSchema: {}, annotations: readOnly },
    async () => fromApi(await api.listGroups()),
  );

  server.registerTool(
    "ledgerly_get_balances",
    {
      title: "Get balances",
      description: "Net balance of each member of a group. Positive means the member is owed money. Does not spend money.",
      inputSchema: { group_id: id },
      annotations: readOnly,
    },
    async ({ group_id }) => fromApi(await api.getBalances(group_id)),
  );

  server.registerTool(
    "ledgerly_create_expense",
    {
      title: "Create expense",
      description:
        "Record a shared expense paid by `payer`. Does not spend money. The server rejects splits that do not add up to the total. Retrying with the same idempotency_key never creates a duplicate.",
      inputSchema: {
        group_id: id,
        payer: id,
        amount,
        description: text(200),
        split,
        idempotency_key: idempotencyKey.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ group_id, payer, amount: total, description, split: s, idempotency_key }) => {
      if (s.rule === "exact") {
        const sum = s.shares.reduce((acc, x) => acc + toUnits(x.amount), 0n);
        if (sum !== toUnits(total)) {
          return fail({ code: "split_mismatch", message: "exact shares must add up to the total amount" });
        }
      }
      return fromApi(
        await api.createExpense(group_id, { payer, amount: total, description, split: s }, idempotency_key ?? randomUUID()),
      );
    },
  );

  server.registerTool(
    "ledgerly_propose_settlement",
    {
      title: "Propose settlement",
      description:
        "Returns the settlement intent and the payment requirements for paying `to`, without paying anything. Does not spend money. Approvals are not built yet, so the answer is only the intent.",
      inputSchema: { group_id: id, to: id, amount },
      annotations: readOnly,
    },
    async ({ group_id, to, amount: total }) => fromApi(await api.proposeSettlement(group_id, { to, amount: total })),
  );

  if (settler) {
    server.registerTool(
      "ledgerly_settle",
      {
        title: "Settle a debt",
        description:
          "Pays `amount` to member `to` from the agent's own wallet on Stellar testnet and records it. SPENDS MONEY and cannot be undone. Maximum 25 per call. Use on_behalf_of to pay a linked owner's debt. The payment terms are checked against the reserved intent before anything is signed.",
        inputSchema: { group_id: id, to: id, amount, on_behalf_of: id.optional(), idempotency_key: idempotencyKey.optional() },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      async (args) => {
        try {
          return reply(await settler(args));
        } catch (e) {
          return fail({ code: String(e.code ?? "settle_failed"), message: String(e.message), ...e.extra });
        }
      },
    );
  }

  return server;
}
