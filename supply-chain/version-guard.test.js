'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { checkDep, diffDeps, cargoDeps, cooldownDays, compareVersions, parseVersion, renderReport } = require('./version-guard.js');

const NOW = new Date('2026-10-25T00:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

// Fake fetch: npm and crates docs keyed by package name, OSV vulns keyed by "name@version".
function stubFetch({ npm = {}, crates = {}, osv = {} }) {
  const reply = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
  return async (url, init) => {
    if (url.startsWith('https://registry.npmjs.org/')) {
      const name = decodeURIComponent(url.slice('https://registry.npmjs.org/'.length));
      return npm[name] ? reply(npm[name]) : reply({}, 404);
    }
    if (url.startsWith('https://crates.io/api/v1/crates/')) {
      assert.ok(init.headers['User-Agent'], 'crates.io needs a User-Agent');
      const name = url.split('/').pop();
      return crates[name] ? reply(crates[name]) : reply({}, 404);
    }
    if (url === 'https://api.osv.dev/v1/query') {
      const q = JSON.parse(init.body);
      return reply({ vulns: osv[`${q.package.name}@${q.version}`] || [] });
    }
    throw new Error(`unexpected url ${url}`);
  };
}

const npmDoc = (versions) => ({
  versions: Object.fromEntries(versions.map(([v, , dep]) => [v, dep ? { deprecated: dep } : {}])),
  time: Object.fromEntries(versions.map(([v, age]) => [v, daysAgo(age)])),
});

const registry = {
  npm: {
    express: npmDoc([['4.18.2', 900], ['4.21.2', 300], ['5.1.0', 60], ['5.2.0', 3], ['6.0.0-rc.1', 20]]),
    request: npmDoc([['2.88.2', 2000, 'request has been deprecated']]),
    '@stellar/stellar-sdk': npmDoc([['14.1.0', 40], ['14.2.0', 10]]),
  },
  crates: {
    'soroban-sdk': { versions: [{ num: '23.0.0', created_at: daysAgo(100), yanked: false }, { num: '23.0.1', created_at: daysAgo(50), yanked: true }] },
  },
  osv: {
    'express@5.1.0': [],
    'express@4.21.2': [{ id: 'GHSA-xxxx', database_specific: { severity: 'HIGH' } }],
    'express@4.18.2': [{ id: 'OSV-unscored' }],
  },
};

const run = (dep) => checkDep({ file: 'package.json', ...dep }, { fetchImpl: stubFetch(registry), now: NOW });
const reasons = (problems) => problems.map((p) => p.reason).join(' / ');

test('clean version passes', async () => {
  assert.deepEqual(await run({ ecosystem: 'npm', name: 'express', version: '5.1.0' }), []);
});

test('outdated npm version fails and names the expected version', async () => {
  const problems = await run({ ecosystem: 'npm', name: 'express', version: '4.21.2' });
  const outdated = problems.find((p) => p.reason.startsWith('outdated'));
  assert.ok(outdated, reasons(problems));
  assert.equal(outdated.expected, '5.1.0');
});

test('OSV high severity fails', async () => {
  const problems = await run({ ecosystem: 'npm', name: 'express', version: '4.21.2' });
  assert.match(reasons(problems), /HIGH advisory GHSA-xxxx/);
});

test('advisory without severity fails as unscored', async () => {
  const problems = await run({ ecosystem: 'npm', name: 'express', version: '4.18.2' });
  assert.match(reasons(problems), /unscored advisory OSV-unscored/);
});

test('range fails', async () => {
  for (const version of ['^5.1.0', '~5.1.0', '*', '>=5.0.0', '5.x']) {
    const problems = await run({ ecosystem: 'npm', name: 'express', version });
    assert.match(reasons(problems), /not an exact version/, version);
  }
});

test('pre-release fails', async () => {
  const problems = await run({ ecosystem: 'npm', name: 'express', version: '6.0.0-rc.1' });
  assert.match(reasons(problems), /pre-release/);
});

test('deprecated npm package fails', async () => {
  const problems = await run({ ecosystem: 'npm', name: 'request', version: '2.88.2' });
  assert.match(reasons(problems), /deprecated/);
});

test('too-young version fails', async () => {
  const problems = await run({ ecosystem: 'npm', name: 'express', version: '5.2.0' });
  assert.match(reasons(problems), /less than 7 days/);
});

test('payment path package uses the 14-day cooldown', async () => {
  assert.equal(cooldownDays('@stellar/stellar-sdk'), 14);
  assert.equal(cooldownDays('@noble/curves'), 14);
  assert.equal(cooldownDays('express'), 7);
  const problems = await run({ ecosystem: 'npm', name: '@stellar/stellar-sdk', version: '14.2.0' });
  assert.match(reasons(problems), /less than 14 days/);
});

test('yanked crate fails', async () => {
  const problems = await run({ ecosystem: 'crates.io', name: 'soroban-sdk', version: '23.0.1', file: 'contracts/Cargo.toml' });
  assert.match(reasons(problems), /yanked/);
});

test('approved version floor is enforced', async () => {
  const policy = [{ ecosystem: 'npm', name: 'express', version: '5.1.0' }];
  const problems = await checkDep(
    { ecosystem: 'npm', name: 'express', version: '5.0.9', file: 'package.json' },
    { fetchImpl: stubFetch(registry), now: NOW, policy },
  );
  assert.match(reasons(problems), /older than the approved version/);
});

test('diff finds added and changed deps only', () => {
  const base = {
    'package.json': JSON.stringify({ dependencies: { a: '1.0.0', b: '1.0.0' } }),
    'contracts/Cargo.toml': '[dependencies]\nsoroban-sdk = "22.0.0"\n',
  };
  const head = {
    'package.json': JSON.stringify({ dependencies: { a: '1.0.0', b: '1.1.0' }, devDependencies: { c: '2.0.0' } }),
    'apps/web/package.json': JSON.stringify({ dependencies: { d: '3.0.0' } }),
    'contracts/Cargo.toml': '[dependencies]\nsoroban-sdk = { version = "=23.0.0", features = ["alloc"] }\n',
    'other/Cargo.toml': '[dependencies]\nignored = "1.0.0"\n',
  };
  const got = diffDeps(base, head).map((d) => `${d.file}:${d.name}@${d.version}`).sort();
  assert.deepEqual(got, [
    'apps/web/package.json:d@3.0.0',
    'contracts/Cargo.toml:soroban-sdk@23.0.0',
    'package.json:b@1.1.0',
    'package.json:c@2.0.0',
  ]);
});

test('cargo parser skips path deps and other sections', () => {
  const deps = cargoDeps('[package]\nname = "x"\nversion = "0.1.0"\n[dependencies]\nlocal = { path = "../l" }\nsha2 = "0.10.8" # pinned\n[dev-dependencies]\nsoroban-sdk = "23.0.0"\n');
  assert.deepEqual(deps, { sha2: '0.10.8' });
});

// ---------- helpers for the cases below ----------

const GUARD = path.join(__dirname, 'version-guard.js');
const SECOND = 1 / 86400; // one second, in days

// One package with a single release published `age` days ago.
const single = (ecosystem, name, version, age) =>
  ecosystem === 'npm'
    ? { npm: { [name]: npmDoc([[version, age]]) } }
    : { crates: { [name]: { versions: [{ num: version, created_at: daysAgo(age), yanked: false }] } } };

const runWith = (fixture, dep, opts = {}) =>
  checkDep({ file: 'package.json', ...dep }, { fetchImpl: stubFetch(fixture), now: NOW, ...opts });

// Delegates to stubFetch but breaks the requests whose url matches.
function breaking(fixture, match, how) {
  const inner = stubFetch(fixture);
  return async (url, init) => {
    if (!url.includes(match)) return inner(url, init);
    if (how === 'http500') return { ok: false, status: 500, json: async () => ({}) };
    throw how;
  };
}

const withOsv = (vulns) =>
  runWith({ ...single('npm', 'pkg', '1.0.0', 100), osv: { 'pkg@1.0.0': vulns } }, { ecosystem: 'npm', name: 'pkg', version: '1.0.0' });

// ---------- OSV severity ----------

test('OSV critical severity fails', async () => {
  const problems = await withOsv([{ id: 'GHSA-crit', database_specific: { severity: 'CRITICAL' } }]);
  assert.match(reasons(problems), /CRITICAL advisory GHSA-crit/);
});

test('OSV medium, moderate and low severity pass', async () => {
  for (const severity of ['MEDIUM', 'MODERATE', 'LOW']) {
    assert.deepEqual(await withOsv([{ id: 'GHSA-ok', database_specific: { severity } }]), [], severity);
  }
});

test('OSV severity is case-insensitive and read from affected[] too', async () => {
  const lower = await withOsv([{ id: 'GHSA-a', database_specific: { severity: 'critical' } }]);
  assert.match(reasons(lower), /CRITICAL advisory GHSA-a/);
  const affected = await withOsv([{ id: 'GHSA-b', affected: [{ ecosystem_specific: { severity: 'HIGH' } }] }]);
  assert.match(reasons(affected), /HIGH advisory GHSA-b/);
});

test('OSV: the worst label of one advisory wins, and every advisory is judged on its own', async () => {
  const problems = await withOsv([
    { id: 'GHSA-mix', database_specific: { severity: 'LOW' }, affected: [{ database_specific: { severity: 'CRITICAL' } }] },
    { id: 'GHSA-low', database_specific: { severity: 'LOW' } },
    { id: 'GHSA-none' },
  ]);
  assert.equal(problems.length, 2, reasons(problems));
  assert.match(reasons(problems), /CRITICAL advisory GHSA-mix/);
  assert.match(reasons(problems), /unscored advisory GHSA-none/);
});

// ---------- fail closed ----------

test('registry HTTP 500 fails the dependency', async () => {
  const fetchImpl = breaking(registry, 'registry.npmjs.org', 'http500');
  const problems = await checkDep({ ecosystem: 'npm', name: 'express', version: '5.1.0', file: 'package.json' }, { fetchImpl, now: NOW });
  assert.match(reasons(problems), /registry lookup failed: .*HTTP 500/);
});

test('registry network error and timeout fail the dependency', async () => {
  for (const err of [new TypeError('fetch failed'), new DOMException('The operation timed out', 'TimeoutError')]) {
    const fetchImpl = breaking(registry, 'registry.npmjs.org', err);
    const problems = await checkDep({ ecosystem: 'npm', name: 'express', version: '5.1.0', file: 'package.json' }, { fetchImpl, now: NOW });
    assert.match(reasons(problems), /registry lookup failed/, err.name);
  }
});

test('crates.io failure fails the dependency', async () => {
  for (const how of ['http500', new TypeError('fetch failed')]) {
    const fetchImpl = breaking(registry, 'crates.io', how);
    const problems = await checkDep({ ecosystem: 'crates.io', name: 'soroban-sdk', version: '23.0.0', file: 'contracts/Cargo.toml' }, { fetchImpl, now: NOW });
    assert.match(reasons(problems), /registry lookup failed/);
  }
});

test('unknown package (registry 404) fails the dependency', async () => {
  const problems = await run({ ecosystem: 'npm', name: 'no-such-package', version: '1.0.0' });
  assert.match(reasons(problems), /registry lookup failed: .*HTTP 404/);
});

test('OSV HTTP 500, network error and timeout fail the dependency', async () => {
  for (const how of ['http500', new TypeError('fetch failed'), new DOMException('The operation timed out', 'TimeoutError')]) {
    const fetchImpl = breaking(registry, 'api.osv.dev', how);
    const problems = await checkDep({ ecosystem: 'npm', name: 'express', version: '5.1.0', file: 'package.json' }, { fetchImpl, now: NOW });
    assert.equal(problems.length, 1, reasons(problems)); // the registry checks still ran and passed
    assert.match(problems[0].reason, /OSV lookup failed/);
  }
});

test('a registry failure does not skip the OSV check, and both are reported', async () => {
  const inner = breaking(registry, 'registry.npmjs.org', 'http500');
  const fetchImpl = async (url, init) =>
    url.includes('api.osv.dev')
      ? { ok: true, status: 200, json: async () => ({ vulns: [{ id: 'GHSA-xxxx', database_specific: { severity: 'HIGH' } }] }) }
      : inner(url, init);
  const problems = await checkDep({ ecosystem: 'npm', name: 'express', version: '5.1.0', file: 'package.json' }, { fetchImpl, now: NOW });
  assert.match(reasons(problems), /registry lookup failed/);
  assert.match(reasons(problems), /HIGH advisory GHSA-xxxx/);
});

// ---------- version not found ----------

test('version missing from the registry fails', async () => {
  const npm = await run({ ecosystem: 'npm', name: 'express', version: '5.1.1' });
  assert.match(reasons(npm), /version not found in the registry/);
  const crate = await run({ ecosystem: 'crates.io', name: 'soroban-sdk', version: '99.0.0', file: 'contracts/Cargo.toml' });
  assert.match(reasons(crate), /version not found in the registry/);
});

// ---------- cooldowns ----------

test('cooldownDays: every 14-day family, and nothing else', () => {
  for (const name of ['@x402/core', '@x402/stellar', '@stellar/stellar-sdk', 'soroban-sdk', 'stellar-xdr', 'stellar-base', 'libsodium-wrappers', 'react-native-sodium', 'crypto-js', 'node-crypto-utils', '@noble/hashes']) {
    assert.equal(cooldownDays(name), 14, name);
  }
  for (const name of ['express', 'react', 'soroban-token-sdk', 'my-stellar-tool', '@types/node', 'x402']) {
    assert.equal(cooldownDays(name), 7, name);
  }
});

test('14-day cooldown is enforced through checkDep for @x402, soroban-sdk, stellar-*, crypto and sodium', async () => {
  const cases = [
    ['npm', '@x402/core'],
    ['npm', 'stellar-base'],
    ['npm', 'crypto-js'],
    ['npm', 'libsodium-wrappers'],
    ['crates.io', 'soroban-sdk'],
    ['crates.io', 'stellar-xdr'],
  ];
  for (const [ecosystem, name] of cases) {
    const problems = await runWith(single(ecosystem, name, '1.0.0', 10), { ecosystem, name, version: '1.0.0' });
    assert.match(reasons(problems), /less than 14 days/, name);
  }
});

test('a normal package keeps the 7-day cooldown', async () => {
  const fixture = single('npm', 'left-pad', '1.0.0', 10);
  assert.deepEqual(await runWith(fixture, { ecosystem: 'npm', name: 'left-pad', version: '1.0.0' }), []);
  const young = await runWith(single('npm', 'left-pad', '1.0.0', 6), { ecosystem: 'npm', name: 'left-pad', version: '1.0.0' });
  assert.match(reasons(young), /less than 7 days/);
});

test('cooldown boundary: exactly at the cooldown passes, one second short fails', async () => {
  for (const [name, days] of [['left-pad', 7], ['@x402/core', 14]]) {
    const dep = { ecosystem: 'npm', name, version: '1.0.0' };
    assert.deepEqual(await runWith(single('npm', name, '1.0.0', days), dep), [], `${name} at ${days} days`);
    const short = await runWith(single('npm', name, '1.0.0', days - SECOND), dep);
    assert.match(reasons(short), new RegExp(`less than ${days} days`), `${name} one second short`);
  }
});

test('"outdated" ignores releases still inside the cooldown, at the boundary too', async () => {
  const doc = { npm: { pkg: npmDoc([['1.0.0', 100], ['1.1.0', 7], ['1.2.0', 7 - SECOND]]) } };
  const problems = await runWith(doc, { ecosystem: 'npm', name: 'pkg', version: '1.0.0' });
  assert.equal(problems.find((p) => p.reason.startsWith('outdated')).expected, '1.1.0');
});

// ---------- Cargo ----------

test('Cargo ranges fail and exact crate versions pass', async () => {
  const fixture = single('crates.io', 'sha2', '0.10.8', 100);
  const dep = (version) => ({ ecosystem: 'crates.io', name: 'sha2', version, file: 'contracts/Cargo.toml' });
  for (const version of ['^0.10.8', '~0.10.8', '*', '>=0.10', '0.10', '0']) {
    assert.match(reasons(await runWith(fixture, dep(version))), /not a plain x\.y\.z version/, version);
  }
  assert.deepEqual(await runWith(fixture, dep('0.10.8')), []);
});

test('Cargo ranges written in a manifest are caught end to end', async () => {
  const deps = diffDeps({}, { 'contracts/Cargo.toml': '[dependencies]\na = "^1.0.0"\nb = { version = "~1.2.0" }\nc = "*"\nd = "=1.0.0"\n' });
  assert.deepEqual(deps.map((d) => `${d.name}@${d.version}`), ['a@^1.0.0', 'b@~1.2.0', 'c@*', 'd@1.0.0']);
  const fixture = single('crates.io', 'd', '1.0.0', 100);
  const out = [];
  for (const dep of deps) out.push(...(await runWith(fixture, dep)));
  assert.deepEqual(out.map((p) => p.name).sort(), ['a', 'b', 'c']);
});

test('cargoDeps reads [workspace.dependencies], strips "=", skips workspace, git and path deps', () => {
  const deps = cargoDeps([
    '[workspace.dependencies]', 'qux = "3.0.0"',
    '[dependencies]', 'foo = "=1.2.3"', 'bar = { version = "=2.0.0", features = ["x"] }',
    'baz = { workspace = true }', 'g = { git = "https://example.com/g" }', 'l = { path = "../l" }',
  ].join('\n'));
  assert.deepEqual(deps, { qux: '3.0.0', foo: '1.2.3', bar: '2.0.0' });
});

test('diffDeps only reads Cargo.toml under contracts/ and ignores node_modules package.json', () => {
  const head = {
    'contracts/group/Cargo.toml': '[dependencies]\na = "1.0.0"\n',
    'contractsx/Cargo.toml': '[dependencies]\nb = "1.0.0"\n',
    'node_modules/dep/package.json': JSON.stringify({ dependencies: { c: '1.0.0' } }),
    'README.md': 'x',
  };
  assert.deepEqual(diffDeps({}, head).map((d) => d.name), ['a']);
});

// ---------- npm specs the guard skips ----------

test('file:, link: and workspace: specs are skipped without any network call', async () => {
  const fetchImpl = async (url) => { throw new Error(`unexpected request to ${url}`); };
  for (const version of ['file:../local', 'file:./x.tgz', 'link:../x', 'workspace:*', 'workspace:^', 'workspace:1.0.0']) {
    assert.deepEqual(await checkDep({ ecosystem: 'npm', name: 'local-pkg', version, file: 'package.json' }, { fetchImpl, now: NOW }), [], version);
  }
});

test('other non-registry npm specs fail as not exact', async () => {
  for (const version of ['latest', 'github:user/repo', 'git+https://example.com/r.git', 'npm:other@1.0.0', 'https://example.com/x.tgz']) {
    assert.match(reasons(await run({ ecosystem: 'npm', name: 'express', version })), /not an exact version/, version);
  }
});

test('file: is only skipped for npm, not for crates', async () => {
  const problems = await checkDep({ ecosystem: 'crates.io', name: 'x', version: 'file:../x', file: 'contracts/Cargo.toml' }, { fetchImpl: stubFetch({}), now: NOW });
  assert.match(reasons(problems), /not a plain x\.y\.z version/);
});

// ---------- compareVersions / parseVersion ----------

test('parseVersion accepts x.y.z with pre-release and build, rejects everything else', () => {
  assert.deepEqual(parseVersion('1.2.3'), { nums: [1, 2, 3], pre: null });
  assert.deepEqual(parseVersion('1.2.3-rc.1+build.5'), { nums: [1, 2, 3], pre: 'rc.1' });
  for (const v of ['^1.2.3', '1.2', 'v1.2.3', '1.2.3.4', '', '*', 'latest']) assert.equal(parseVersion(v), null, v);
});

test('compareVersions orders numerically, not lexically', () => {
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
  assert.ok(compareVersions('2.0.0', '10.0.0') < 0);
  assert.ok(compareVersions('1.0.10', '1.0.9') > 0);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2.3+a', '1.2.3+b'), 0);
});

test('compareVersions: a pre-release sorts before its release', () => {
  assert.ok(compareVersions('1.0.0-rc.1', '1.0.0') < 0);
  assert.ok(compareVersions('1.0.0', '1.0.0-rc.1') > 0);
  assert.ok(compareVersions('1.0.0-alpha', '1.0.0-beta') < 0);
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0-rc.1'), 0);
  assert.ok(compareVersions('1.0.0-rc.1', '0.9.9') > 0);
});

test('compareVersions: numeric pre-release identifiers compare as numbers', { todo: 'BUG (documented shortcut): pre-release order is lexical, so rc.10 sorts before rc.2. Pre-releases always fail the guard, so impact is low.' }, () => {
  assert.ok(compareVersions('1.0.0-rc.10', '1.0.0-rc.2') > 0);
});

// ---------- fail-open candidate ----------

test('a release with no publish time in the registry document must not pass the cooldown', { todo: 'BUG: npm doc.time[version] missing gives an Invalid Date, NaN > cutoff is false, so the cooldown check passes. Fail-open; should fail closed.' }, async () => {
  const doc = { npm: { pkg: { versions: { '1.0.0': {} }, time: {} } } };
  const problems = await runWith(doc, { ecosystem: 'npm', name: 'pkg', version: '1.0.0' });
  assert.ok(problems.length > 0, 'expected a problem, got none');
});

// ---------- policy (approved-versions.json shape) ----------

const policyFile = JSON.parse(JSON.stringify({
  _format: 'see approved-versions.json',
  packages: [
    { ecosystem: 'npm', name: 'pkg', version: '1.2.0', approved: '2026-10-01', by: '@someone', next_review: '2026-11-01' },
    { ecosystem: 'crates.io', name: 'crate', version: '2.0.0', approved: '2026-10-01', by: '@someone', next_review: '2026-11-01' },
  ],
}));
const policyFixture = {
  npm: { pkg: npmDoc([['1.0.0', 300], ['1.1.0', 200], ['1.2.0', 100], ['1.3.0', 50]]) },
  crates: { crate: { versions: ['1.9.0', '2.0.0', '2.1.0'].map((num, i) => ({ num, created_at: daysAgo(300 - i * 100), yanked: false })) } },
};
const withPolicy = (dep) => runWith(policyFixture, { file: 'package.json', ...dep }, { policy: policyFile.packages });

test('policy: older than the approved version fails and names it', async () => {
  const problems = await withPolicy({ ecosystem: 'npm', name: 'pkg', version: '1.1.0' });
  const older = problems.find((p) => p.reason === 'older than the approved version');
  assert.ok(older, reasons(problems));
  assert.equal(older.expected, '1.2.0');
});

test('policy: equal to the approved version is not flagged', async () => {
  const problems = await withPolicy({ ecosystem: 'npm', name: 'pkg', version: '1.2.0' });
  assert.ok(!problems.some((p) => /approved/.test(p.reason)), reasons(problems));
});

test('policy: newer than the approved version is not flagged', async () => {
  const problems = await withPolicy({ ecosystem: 'npm', name: 'pkg', version: '1.3.0' });
  assert.ok(!problems.some((p) => /approved/.test(p.reason)), reasons(problems));
  assert.deepEqual(problems, []);
});

test('policy: applies per ecosystem and per name', async () => {
  const crate = await withPolicy({ ecosystem: 'crates.io', name: 'crate', version: '1.9.0', file: 'contracts/Cargo.toml' });
  assert.match(reasons(crate), /older than the approved version/);
  // same name in the other ecosystem and an unlisted package are not constrained
  const other = await runWith({ npm: { crate: npmDoc([['1.0.0', 100]]) } }, { ecosystem: 'npm', name: 'crate', version: '1.0.0' }, { policy: policyFile.packages });
  assert.deepEqual(other, []);
});

test('the committed approved-versions.json is well formed', () => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'approved-versions.json'), 'utf8'));
  const seen = new Set();
  for (const e of file.packages) {
    assert.ok(['npm', 'crates.io'].includes(e.ecosystem), `${e.name}: ecosystem`);
    assert.ok(parseVersion(e.version) && !parseVersion(e.version).pre, `${e.name}: ${e.version} must be an exact stable version, otherwise the guard silently skips the floor`);
    assert.match(e.next_review, /^\d{4}-\d{2}-\d{2}$/, e.name);
    const key = `${e.ecosystem}:${e.name}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
  }
});

// ---------- renderReport ----------

test('renderReport with no problems', () => {
  assert.equal(
    renderReport([{}, {}], []),
    '## LLM outdated version guard\n\nChecked 2 added or changed dependencies. No problems found.\n',
  );
});

test('renderReport lists problems in a table, with "-" for a missing expected version', () => {
  const dep = { ecosystem: 'npm', name: 'express', version: '4.21.2', file: 'package.json' };
  const out = renderReport([dep, dep], [{ ...dep, expected: '5.1.0', reason: 'outdated' }, { ...dep, expected: '', reason: 'pre-release version' }]);
  assert.match(out, /Found 2 problem\(s\) in 2 added or changed dependencies\./);
  assert.match(out, /\| Dependency \| Ecosystem \| File \| Proposed \| Expected \| Reason \|/);
  assert.match(out, /\| `express` \| npm \| package\.json \| 4\.21\.2 \| 5\.1\.0 \| outdated \|/);
  assert.match(out, /\| `express` \| npm \| package\.json \| 4\.21\.2 \| - \| pre-release version \|/);
  assert.match(out, /Pin each dependency to the expected version/);
  assert.ok(out.endsWith('\n'));
});

test('renderReport escapes pipes, backslashes and newlines so a value cannot break the table', () => {
  const dep = { ecosystem: 'npm', name: 'a|b', version: 'x\\y', file: 'p.json' };
  const out = renderReport([dep], [{ ...dep, expected: '', reason: 'line1\nline2 | tail' }]);
  const row = out.split('\n').find((l) => l.startsWith('| `a'));
  assert.equal(row, '| `a\\|b` | npm | p.json | x\\\\y | - | line1 line2 \\| tail |');
});

// ---------- git manifest loading and main() through the CLI ----------

function makeRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-guard-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q');
  return {
    dir,
    write(files) {
      for (const [p, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
        fs.writeFileSync(path.join(dir, p), text);
      }
    },
    commit(msg) {
      git('add', '-A');
      git('commit', '-q', '--allow-empty', '-m', msg);
      return git('rev-parse', 'HEAD');
    },
  };
}

const cli = (repo, args, preload) =>
  spawnSync(process.execPath, [...(preload ? ['--require', preload] : []), GUARD, ...args], { cwd: repo.dir, encoding: 'utf8' });

test('CLI: no dependency changes exits 0', (t) => {
  const repo = makeRepo(t);
  repo.write({ 'package.json': JSON.stringify({ dependencies: { a: '1.0.0' } }), 'README.md': 'a' });
  const base = repo.commit('base');
  repo.write({ 'README.md': 'b' });
  const head = repo.commit('head');
  const res = cli(repo, ['--base', base, '--head', head]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Checked 0 added or changed dependencies\. No problems found\./);
});

test('CLI: exits 1, prints the report and writes --report for ranges in npm and Cargo manifests', (t) => {
  const repo = makeRepo(t);
  repo.write({ 'package.json': JSON.stringify({ dependencies: { a: '1.0.0' } }), 'contracts/group/Cargo.toml': '[dependencies]\nsha2 = "0.10.8"\n' });
  const base = repo.commit('base');
  repo.write({
    'package.json': JSON.stringify({ dependencies: { a: '1.0.0', 'left-pad': '^1.3.0' }, devDependencies: { local: 'file:../local', ws: 'workspace:*' } }),
    'contracts/group/Cargo.toml': '[dependencies]\nsha2 = "^0.10.8"\n',
    'node_modules/dep/package.json': JSON.stringify({ dependencies: { ignored: '^1.0.0' } }),
  });
  const head = repo.commit('head');
  const reportPath = path.join(repo.dir, 'out', 'report.md');
  fs.mkdirSync(path.dirname(reportPath));
  const res = cli(repo, ['--base', base, '--head', head, '--report', reportPath]);
  assert.equal(res.status, 1, res.stderr);
  assert.match(res.stdout, /Found 2 problem\(s\) in 4 added or changed dependencies\./);
  assert.match(res.stdout, /\| `left-pad` \| npm \| package\.json \| \^1\.3\.0 \|/);
  assert.match(res.stdout, /\| `sha2` \| crates\.io \| contracts\/group\/Cargo\.toml \| \^0\.10\.8 \|/);
  assert.ok(!res.stdout.includes('ignored'));
  assert.equal(fs.readFileSync(reportPath, 'utf8'), res.stdout);
});

test('CLI: only file: and workspace: dependencies added exits 0', (t) => {
  const repo = makeRepo(t);
  const base = repo.commit('empty base'); // no manifests on base: every head dependency counts as added
  repo.write({ 'apps/web/package.json': JSON.stringify({ dependencies: { shared: 'workspace:*', local: 'file:../local' } }) });
  const head = repo.commit('head');
  const res = cli(repo, ['--base', base, '--head', head]);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /Checked 2 added or changed dependencies\. No problems found\./);
});

test('CLI: missing --base or --head, or an unknown revision, exits 1', (t) => {
  const repo = makeRepo(t);
  const sha = repo.commit('base');
  const missing = cli(repo, ['--base', sha]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--base and --head are required/);
  const unknown = cli(repo, ['--base', sha, '--head', 'no-such-rev']);
  assert.equal(unknown.status, 1);
});

test('CLI: an unreadable --policy file exits 1 instead of passing', (t) => {
  const repo = makeRepo(t);
  const sha = repo.commit('base');
  const res = cli(repo, ['--base', sha, '--head', sha, '--policy', path.join(repo.dir, 'missing.json')]);
  assert.equal(res.status, 1);
});

test('CLI: full run with a stubbed fetch loads the policy file and enforces it', (t) => {
  const repo = makeRepo(t);
  // Preload that replaces fetch, so main() runs unchanged and never touches the network.
  const preload = path.join(repo.dir, 'stub-fetch.cjs');
  fs.writeFileSync(preload, `
    const day = 86400000;
    const ago = (n) => new Date(Date.now() - n * day).toISOString();
    globalThis.fetch = async (url) => {
      const body = url.startsWith('https://registry.npmjs.org/pkg')
        ? { versions: { '1.0.0': {}, '1.1.0': {} }, time: { '1.0.0': ago(300), '1.1.0': ago(100) } }
        : url === 'https://api.osv.dev/v1/query' ? { vulns: [] } : null;
      return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
    };
  `);
  const policy = path.join(repo.dir, 'policy.json');
  fs.writeFileSync(policy, JSON.stringify({ packages: [{ ecosystem: 'npm', name: 'pkg', version: '1.1.0' }] }));
  const base = repo.commit('empty base');

  repo.write({ 'package.json': JSON.stringify({ dependencies: { pkg: '1.1.0' } }) });
  const good = repo.commit('good');
  const ok = cli(repo, ['--base', base, '--head', good, '--policy', policy], preload);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);

  repo.write({ 'package.json': JSON.stringify({ dependencies: { pkg: '1.0.0' } }) });
  const bad = repo.commit('older than approved');
  const res = cli(repo, ['--base', base, '--head', bad, '--policy', policy], preload);
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /older than the approved version/);
  assert.match(res.stdout, /\| `pkg` \| npm \| package\.json \| 1\.0\.0 \| 1\.1\.0 \|/);
});
