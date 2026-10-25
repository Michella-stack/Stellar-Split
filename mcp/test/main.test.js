import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MAIN = fileURLToPath(new URL("../src/main.js", import.meta.url));

// Runs main.js with a clean environment so the host's own variables never leak into the test.
function run(env) {
  const r = spawnSync(process.execPath, [MAIN], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8", timeout: 10_000 });
  return { code: r.status, err: r.stderr };
}

const ok = { LEDGERLY_API_URL: "https://api.example.test", LEDGERLY_TOKEN: "t" };

test("refuses to start without the API url or token", () => {
  assert.equal(run({}).code, 1);
  assert.equal(run({ LEDGERLY_API_URL: ok.LEDGERLY_API_URL }).code, 1);
  assert.equal(run({ LEDGERLY_TOKEN: "t" }).code, 1);
});

test("refuses a non-https API url unless it is loopback, and prints no stack trace", () => {
  const r = run({ ...ok, LEDGERLY_API_URL: "http://evil.example" });
  assert.equal(r.code, 1);
  assert.match(r.err, /must be https/);
  assert.doesNotMatch(r.err, /\n\s+at /);
});

test("an invalid API url gives a clean error", () => {
  const r = run({ ...ok, LEDGERLY_API_URL: "notaurl" });
  assert.equal(r.code, 1);
  assert.match(r.err, /not a valid URL/);
  assert.doesNotMatch(r.err, /\n\s+at /);
});

test("http mode on a non-loopback host without MCP_AUTH_TOKEN exits cleanly", () => {
  const r = run({ ...ok, MCP_TRANSPORT: "http", MCP_HTTP_HOST: "0.0.0.0" });
  assert.equal(r.code, 1);
  assert.match(r.err, /MCP_AUTH_TOKEN is required/);
  assert.doesNotMatch(r.err, /\n\s+at /);
});

test("a signer file that is missing or not a secret key stops the start without echoing its content", async () => {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const file = `${mkdtempSync(`${tmpdir()}/signer-`)}/signer`;
  writeFileSync(file, "not-a-secret-key-xyz");
  for (const f of [file, `${file}.missing`]) {
    const r = run({ ...ok, LEDGERLY_SIGNER_FILE: f });
    assert.equal(r.code, 1);
    assert.match(r.err, /LEDGERLY_SIGNER_FILE/);
    assert.doesNotMatch(r.err, /xyz|\n\s+at /);
  }
});
