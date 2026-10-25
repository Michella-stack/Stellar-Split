import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createApi } from "../src/api.js";
import { createSettler, ASSETS } from "../src/settle.js";
import { buildServer } from "../src/tools.js";

const signer = Keypair.random();
const SECRET = signer.secret();
const creditor = Keypair.random().publicKey();
const MEMO = "ab".repeat(32);

const listen = async (handler) => {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => (server.closeAllConnections(), server.close()) };
};
const readBody = async (req) => {
  let b = "";
  for await (const c of req) b += c;
  return b;
};

// One scenario: a mock API that reserves an intent and answers the x402 endpoint, plus a mock Horizon.
// `tweak` edits the matching 402 entry, `extraEntries` adds more, `paid` is the answer once PAYMENT-SIGNATURE arrives.
async function scenario({ tweak = (a) => a, extraEntries = [], duplicate = false, intent = {}, paid, horizonFail = false } = {}) {
  const state = { submitted: [], x402Calls: [], reserved: [] };
  const horizon = await listen(async (req, res) => {
    if (req.method === "GET") return res.writeHead(200).end(JSON.stringify({ sequence: "100" }));
    const tx = new URLSearchParams(await readBody(req)).get("tx");
    if (horizonFail) return res.writeHead(400).end(JSON.stringify({ extras: { result_codes: { transaction: "tx_bad_seq" } } }));
    state.submitted.push(TransactionBuilder.fromXDR(tx, Networks.TESTNET));
    res.writeHead(200).end(JSON.stringify({ successful: true }));
  });
  const api = await listen(async (req, res) => {
    const body = await readBody(req);
    const send = (status, obj) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(obj));
    if (req.url.endsWith("/settlements/intents")) {
      state.reserved.push(JSON.parse(body));
      return send(201, {
        intent: {
          id: "intent-1", from: "m1", to: "m2", amount: "5.0000000", asset: { code: "USDC", issuer: ASSETS.USDC }, network: "stellar:testnet",
          payFrom: signer.publicKey(), payer: signer.publicKey(), payTo: creditor, memo: { type: "hash", value: MEMO },
          status: "reserved", expiresAt: new Date(Date.now() + 600_000).toISOString(), ...intent,
        },
      });
    }
    state.x402Calls.push(req.headers["payment-signature"] ?? null);
    if (req.headers["payment-signature"]) return paid ? send(paid.status, paid.body) : send(200, { settlement: { id: "s1" } });
    const entry = tweak({
      scheme: "exact", network: "stellar:testnet", asset: `USDC:${ASSETS.USDC}`, payTo: creditor, amount: "5.0000000", maxTimeoutSeconds: 600,
      resource: `http://${req.headers.host}${req.url}`,
      extra: { intentId: "intent-1", memoType: "hash", memo: MEMO, expiresAt: "x" },
    });
    send(402, { x402Version: 1, error: null, accepts: [entry, ...(duplicate ? [entry] : []), ...extraEntries] });
  });
  const apiClient = createApi({ baseUrl: api.url, token: "tok" });
  const settler = createSettler({ secret: SECRET, apiUrl: api.url, api: apiClient, horizonUrl: horizon.url });
  return { state, settler, apiClient, close: () => (api.close(), horizon.close()) };
}

const args = { group_id: "g1", to: "m2", amount: "5" };

async function refuses(opts, code = "terms_mismatch") {
  const s = await scenario(opts);
  await assert.rejects(s.settler(args), (e) => e.code === code);
  assert.equal(s.state.submitted.length, 0, "nothing may be submitted");
  assert.equal(s.state.x402Calls.filter(Boolean).length, 0, "no payment header may be sent");
  s.close();
}

test("happy path: reserves, checks terms, submits a hash-memo payment with time bounds, then proves it", async () => {
  const s = await scenario();
  const r = await s.settler({ ...args, on_behalf_of: "m1" });
  assert.equal(r.status, "settled");
  assert.match(r.txHash, /^[0-9a-f]{64}$/);
  assert.equal(r.explorerUrl, `https://stellar.expert/explorer/testnet/tx/${r.txHash}`);
  assert.deepEqual(s.state.reserved[0], { to: "m2", amount: "5", onBehalfOf: "m1" });
  const [tx] = s.state.submitted;
  assert.equal(Buffer.from(tx.hash()).toString("hex"), r.txHash);
  assert.equal(tx.source, signer.publicKey());
  assert.equal(Buffer.from(tx.memo.value).toString("hex"), MEMO);
  const op = tx.operations[0];
  assert.deepEqual([op.type, op.destination, op.amount, op.asset.code, op.asset.issuer], ["payment", creditor, "5.0000000", "USDC", ASSETS.USDC]);
  assert.equal(tx.timeBounds.minTime, "0");
  assert.ok(Number(tx.timeBounds.maxTime) * 1000 <= Date.now() + 600_000);
  assert.equal(s.state.x402Calls[0], null);
  const sig = JSON.parse(Buffer.from(s.state.x402Calls[1], "base64"));
  assert.deepEqual(sig, { x402Version: 1, scheme: "exact", network: "stellar:testnet", payload: { txHash: r.txHash } });
  s.close();
});

test("each terms mismatch aborts with nothing signed", async (t) => {
  const cases = {
    payTo: { tweak: (a) => ({ ...a, payTo: Keypair.random().publicKey() }) },
    "amount off by one stroop": { tweak: (a) => ({ ...a, amount: "5.0000001" }) },
    "asset issuer": { tweak: (a) => ({ ...a, asset: `USDC:${ASSETS.EURC}` }) },
    "asset code": { tweak: (a) => ({ ...a, asset: `EURC:${ASSETS.EURC}` }) },
    network: { tweak: (a) => ({ ...a, network: "stellar:pubnet" }) },
    memo: { tweak: (a) => ({ ...a, extra: { ...a.extra, memo: "cd".repeat(32) } }) },
    scheme: { tweak: (a) => ({ ...a, scheme: "upto" }) },
    "resource host": { tweak: (a) => ({ ...a, resource: "https://evil.example/v1/x402" }) },
    "two matching entries": { duplicate: true },
    "intent asset not pinned": { intent: { asset: { code: "USDC", issuer: Keypair.random().publicKey() } } },
    "intent payer is not the signer": { intent: { payer: creditor, payFrom: creditor } },
    "intent amount differs from the request": { intent: { amount: "6.0000000" } },
  };
  for (const [name, opts] of Object.entries(cases)) await t.test(name, () => refuses(opts));
});

test("one match among non-matching entries is accepted", async () => {
  const s = await scenario({ extraEntries: [{ scheme: "exact", network: "stellar:pubnet" }] });
  assert.equal((await s.settler(args)).status, "settled");
  s.close();
});

test("amount above 25 is refused before anything is reserved", async () => {
  const s = await scenario();
  await assert.rejects(s.settler({ ...args, amount: "25.0000001" }), (e) => e.code === "amount_over_ceiling");
  assert.equal(s.state.reserved.length, 0);
  s.close();
});

test("an intent id is signed at most once per process", async () => {
  const s = await scenario();
  await s.settler(args);
  await assert.rejects(s.settler(args), (e) => e.code === "already_signed");
  assert.equal(s.state.submitted.length, 1);
  s.close();
});

test("an expired intent is not signed", () => refuses({ intent: { expiresAt: new Date(Date.now() - 1000).toISOString() } }, "intent_expired"));

test("402 with an error after submit surfaces the hash and the reason", async () => {
  const s = await scenario({ paid: { status: 402, body: { error: { code: "PAYMENT_MISMATCH", message: "No USDC payment" }, accepts: [] } } });
  await assert.rejects(s.settler(args), (e) => e.code === "PAYMENT_MISMATCH" && /not record/.test(e.message) && /^[0-9a-f]{64}$/.test(e.extra.txHash));
  assert.equal(s.state.submitted.length, 1);
  s.close();
});

test("a Horizon rejection is reported", async () => {
  const s = await scenario({ horizonFail: true });
  await assert.rejects(s.settler(args), (e) => e.code === "submit_failed" && /tx_bad_seq/.test(e.message));
  s.close();
});

async function connectTool(settler, api) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await buildServer(api, { settler }).connect(a);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(b);
  return client;
}

test("ledgerly_settle is absent without a settler and destructive when present", async () => {
  const s = await scenario();
  const without = await (await connectTool(undefined, s.apiClient)).listTools();
  assert.ok(!without.tools.some((t) => t.name === "ledgerly_settle"));
  const { tools } = await (await connectTool(s.settler, s.apiClient)).listTools();
  const t = tools.find((x) => x.name === "ledgerly_settle");
  assert.equal(t.annotations.destructiveHint, true);
  assert.notEqual(t.annotations.readOnlyHint, true);
  s.close();
});

test("KEY-03: the secret never appears in a result, an error or a log, and secret-shaped args are rejected", async () => {
  const logs = [];
  const orig = [console.log, console.error, console.warn];
  console.log = console.error = console.warn = (...a) => logs.push(a.join(" "));
  try {
    const s = await scenario();
    const client = await connectTool(s.settler, s.apiClient);
    const ok = await client.callTool({ name: "ledgerly_settle", arguments: args });
    const bad = await client.callTool({ name: "ledgerly_settle", arguments: { ...args, to: SECRET } });
    const over = await client.callTool({ name: "ledgerly_settle", arguments: { ...args, group_id: "g2", amount: "26" } });
    assert.equal(JSON.parse(ok.content[0].text).status, "settled");
    assert.equal(bad.isError, true);
    assert.equal(over.isError, true);
    assert.equal(s.state.reserved.length, 1, "the secret-shaped call reserved nothing");
    const all = JSON.stringify([ok, bad, over, logs]);
    assert.ok(!all.includes(SECRET));
    assert.ok(!/S[A-Z2-7]{55}/.test(all));
    s.close();
  } finally {
    [console.log, console.error, console.warn] = orig;
  }
});
