'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkDep, diffDeps, cargoDeps, cooldownDays } = require('./version-guard.js');

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
