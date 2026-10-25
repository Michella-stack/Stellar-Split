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
const text = (max) => z.string().min(1).max(max).refine(noSecret, "looks like a Stellar secret key");

// 7 decimals, like USDC on Stellar. BigInt avoids float rounding in the sum check.
export function toUnits(v) {
  const [whole, frac = ""] = v.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, "0"));
}

const split = z.discriminatedUnion("rule", [
  z.object({ rule: z.literal("equal"), participants: z.array(id).min(1).max(50) }),
  z.object({
    rule: z.literal("exact"),
    shares: z.array(z.object({ member: id, amount })).min(1).max(50),
  }),
]);

// Agent-facing names (rule, member) mapped to the API shape (type, memberId).
const toApiSplit = (s) =>
  s.rule === "equal"
    ? { type: "equal", participants: s.participants }
    : { type: "exact", shares: s.shares.map((x) => ({ memberId: x.member, amount: x.amount })) };

const reply = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (error, status = 0) => ({
  isError: true,
  content: [{ type: "text", text: JSON.stringify({ status, error }) }],
});
const fromApi = (r) => (r.ok ? reply(r.data) : fail(r.error, r.status));

export function buildServer(api) {
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
        idempotency_key: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/).refine(noSecret, "looks like a Stellar secret key").optional(),
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
        await api.createExpense(group_id, { paidBy: payer, amount: total, description, split: toApiSplit(s) }, idempotency_key ?? randomUUID()),
      );
    },
  );

  server.registerTool(
    "ledgerly_propose_settlement",
    {
      title: "Propose settlement",
      description:
        "Returns the settlement intent and the payment requirements for paying `to`, without paying anything. Does not spend money. May answer that the amount needs human approval.",
      inputSchema: { group_id: id, to: id, amount },
      annotations: readOnly,
    },
    async ({ group_id, to, amount: total }) => fromApi(await api.proposeSettlement(group_id, { to, amount: total })),
  );

  server.registerTool(
    "ledgerly_get_approval",
    {
      title: "Get approval status",
      description: "Status of a pending human approval. Does not spend money. The agent cannot approve its own requests.",
      inputSchema: { approval_id: id },
      annotations: readOnly,
    },
    async ({ approval_id }) => fromApi(await api.getApproval(approval_id)),
  );

  return server;
}
