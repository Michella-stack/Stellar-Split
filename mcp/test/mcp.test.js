import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApi } from "../src/api.js";
import { startHttp } from "../src/http.js";
import { buildServer, toUnits } from "../src/tools.js";

const TOKEN = "agent-secret-token-123";
const FAKE_SECRET = "S" + "A".repeat(55); // matches the Stellar secret key shape

// Mock Ledgerly API: records every request and answers from a table of canned replies.
async function mockApi(routes) {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    seen.push({ method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
    const reply = routes[`${req.method} ${req.url.split("?")[0]}`] ?? { status: 404, body: { code: "not_found", message: "no route" } };
    res.writeHead(reply.status ?? 200, { "content-type": "application/json" }).end(JSON.stringify(reply.body));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { seen, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

async function connect(api) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await buildServer(api).connect(a);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(b);
  return client;
}

const parse = (r) => JSON.parse(r.content[0].text);

test("exposes only the phase 1 tools and nothing that pays", async () => {
  const mock = await mockApi({});
  const client = await connect(createApi({ baseUrl: mock.url, token: TOKEN }));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "ledgerly_create_expense",
    "ledgerly_get_approval",
    "ledgerly_get_balances",
    "ledgerly_list_groups",
    "ledgerly_propose_settlement",
  ]);
  assert.ok(tools.every((t) => t.annotations?.destructiveHint === false));
  assert.ok(tools.filter((t) => t.name !== "ledgerly_create_expense").every((t) => t.annotations.readOnlyHint === true));
  mock.close();
});

test("reads groups and balances and sends the credential, never returning it", async () => {
  const mock = await mockApi({
    "GET /v1/groups": { body: { groups: [{ id: "g1", name: "Flat" }] } },
    "GET /v1/groups/g1/balances": { body: { balances: [{ member: "marta", net: "-12.5000000" }] } },
  });
  const client = await connect(createApi({ baseUrl: mock.url, token: TOKEN }));
  const groups = await client.callTool({ name: "ledgerly_list_groups", arguments: {} });
  const bal = await client.callTool({ name: "ledgerly_get_balances", arguments: { group_id: "g1" } });
  assert.equal(parse(groups).groups[0].id, "g1");
  assert.equal(parse(bal).balances[0].net, "-12.5000000");
  assert.equal(mock.seen[0].headers.authorization, `Bearer ${TOKEN}`);
  assert.ok(!JSON.stringify([groups, bal]).includes(TOKEN));
  mock.close();
});

test("create_expense sends an idempotency key and the split", async () => {
  const mock = await mockApi({ "POST /v1/groups/g1/expenses": { status: 201, body: { id: "e1" } } });
  const client = await connect(createApi({ baseUrl: mock.url, token: TOKEN }));
  const args = {
    group_id: "g1",
    payer: "victor",
    amount: "42",
    description: "Electricity",
    split: { rule: "equal", participants: ["victor", "marta"] },
  };
  const r = await client.callTool({ name: "ledgerly_create_expense", arguments: args });
  assert.equal(parse(r).id, "e1");
  assert.match(mock.seen[0].headers["idempotency-key"], /^[A-Za-z0-9_-]{8,}/);
  assert.deepEqual(mock.seen[0].body.split, { type: "equal", participants: ["victor", "marta"] });
  assert.equal(mock.seen[0].body.paidBy, "victor");
  await client.callTool({ name: "ledgerly_create_expense", arguments: { ...args, idempotency_key: "retry-key-0001" } });
  assert.equal(mock.seen[1].headers["idempotency-key"], "retry-key-0001");
  mock.close();
});

test("rejects bad input before calling the API", async () => {
  const mock = await mockApi({});
  const client = await connect(createApi({ baseUrl: mock.url, token: TOKEN }));
  const base = { group_id: "g1", payer: "victor", description: "x", split: { rule: "equal", participants: ["victor"] } };
  const bad = [
    { ...base, amount: "0" },
    { ...base, amount: "-5" },
    { ...base, amount: "1.12345678" },
    { ...base, amount: "10", description: `key ${FAKE_SECRET}` },
    { ...base, amount: "10", group_id: "../etc/passwd" },
  ];
  for (const args of bad) {
    const outcome = await client.callTool({ name: "ledgerly_create_expense", arguments: args }).then(
      (r) => r.isError === true,
      () => true,
    );
    assert.ok(outcome, JSON.stringify(args));
  }
  const mismatch = await client.callTool({
    name: "ledgerly_create_expense",
    arguments: { ...base, amount: "10", split: { rule: "exact", shares: [{ member: "victor", amount: "4" }, { member: "marta", amount: "5.99" }] } },
  });
  assert.equal(mismatch.isError, true);
  assert.equal(parse(mismatch).error.code, "split_mismatch");
  assert.equal(mock.seen.length, 0);
  mock.close();
});

test("rejects a Stellar secret key in every text-like field", async () => {
  const mock = await mockApi({});
  const client = await connect(createApi({ baseUrl: mock.url, token: TOKEN }));
  const rejected = (call) => call.then((r) => r.isError === true, () => true);
  const expense = { group_id: "g1", payer: "victor", amount: "10", description: "x", split: { rule: "equal", participants: ["victor"] } };
  const attempts = [
    ["ledgerly_create_expense", { ...expense, payer: FAKE_SECRET }],
    ["ledgerly_create_expense", { ...expense, group_id: FAKE_SECRET }],
    ["ledgerly_create_expense", { ...expense, split: { rule: "equal", participants: [FAKE_SECRET] } }],
    ["ledgerly_create_expense", { ...expense, split: { rule: "exact", shares: [{ member: FAKE_SECRET, amount: "10" }] } }],
    ["ledgerly_create_expense", { ...expense, idempotency_key: FAKE_SECRET }],
    ["ledgerly_get_balances", { group_id: FAKE_SECRET }],
    ["ledgerly_propose_settlement", { group_id: "g1", to: FAKE_SECRET, amount: "5" }],
    ["ledgerly_get_approval", { approval_id: FAKE_SECRET }],
  ];
  for (const [name, args] of attempts) {
    assert.ok(await rejected(client.callTool({ name, arguments: args })), `${name} accepted a secret key in ${JSON.stringify(args).slice(0, 80)}`);
  }
  assert.equal(mock.seen.length, 0);
  mock.close();
});

test("surfaces API policy errors without leaking the token", async () => {
  const mock = await mockApi({ "POST /v1/groups/g1/settlements": { status: 403, body: { error: { code: "policy_daily_cap", message: "daily cap exceeded" } } } });
  const client = await connect(createApi({ baseUrl: mock.url, token: TOKEN }));
  const r = await client.callTool({ name: "ledgerly_propose_settlement", arguments: { group_id: "g1", to: "marta", amount: "25" } });
  assert.equal(r.isError, true);
  assert.equal(parse(r).error.code, "policy_daily_cap");
  assert.equal(parse(r).status, 403);
  assert.ok(!r.content[0].text.includes(TOKEN));
  assert.equal(mock.seen[0].url, "/v1/groups/g1/settlements?dry_run=true");
  mock.close();
});

test("propose_settlement can answer pending approval, and get_approval reads it", async () => {
  const mock = await mockApi({
    "POST /v1/groups/g1/settlements": { status: 202, body: { status: "pending_approval", approval_id: "ap_1" } },
    "GET /v1/approvals/ap_1": { body: { id: "ap_1", status: "pending" } },
  });
  const client = await connect(createApi({ baseUrl: mock.url, token: TOKEN }));
  const p = await client.callTool({ name: "ledgerly_propose_settlement", arguments: { group_id: "g1", to: "marta", amount: "8" } });
  assert.equal(parse(p).approval_id, "ap_1");
  const a = await client.callTool({ name: "ledgerly_get_approval", arguments: { approval_id: "ap_1" } });
  assert.equal(parse(a).status, "pending");
  mock.close();
});

test("an unreachable API gives a clean error", async () => {
  const client = await connect(createApi({ baseUrl: "http://127.0.0.1:1", token: TOKEN, timeoutMs: 500 }));
  const r = await client.callTool({ name: "ledgerly_list_groups", arguments: {} });
  assert.equal(r.isError, true);
  assert.equal(parse(r).error.code, "network_error");
});

test("toUnits is exact", () => {
  assert.equal(toUnits("0.0000001"), 1n);
  assert.equal(toUnits("12.5"), 125_000_000n);
});

test("http transport requires the bearer token and refuses non-loopback without one", async () => {
  const mock = await mockApi({ "GET /v1/groups": { body: { groups: [] } } });
  const api = createApi({ baseUrl: mock.url, token: TOKEN });
  assert.throws(() => startHttp({ api, host: "0.0.0.0" }), /MCP_AUTH_TOKEN is required/);

  const server = await startHttp({ api, port: 0, authToken: "mcp-token-abc" });
  const url = new URL(`http://127.0.0.1:${server.address().port}/mcp`);
  assert.equal((await fetch(url, { method: "POST" })).status, 401);
  assert.equal((await fetch(url, { method: "POST", headers: { authorization: "Bearer wrong" } })).status, 401);

  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: "Bearer mcp-token-abc" } } }));
  const r = await client.callTool({ name: "ledgerly_list_groups", arguments: {} });
  assert.deepEqual(parse(r).groups, []);
  await client.close();
  server.close();
  mock.close();
});
