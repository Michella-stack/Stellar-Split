#!/usr/bin/env node
// LLM outdated version guard (PRD sections 9.6 and 10.5).
// Node 22 built-ins only. Usage:
//   node version-guard.js --base <sha> --head <sha> [--policy approved-versions.json] [--report report.md]
'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const { parseArgs } = require('node:util');

const DAY = 24 * 60 * 60 * 1000;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

// ---------- versions ----------

function parseVersion(v) {
  const m = SEMVER.exec(v);
  return m ? { nums: [+m[1], +m[2], +m[3]], pre: m[4] || null } : null;
}

function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  return pa.pre < pb.pre ? -1 : 1; // shortcut: lexical pre-release order, only used for ties between pre-releases
}

function cooldownDays(name) {
  const sensitive =
    /^@x402\//.test(name) || /^@stellar\//.test(name) || name === 'soroban-sdk' ||
    /^stellar-/.test(name) || /crypto|sodium|noble/.test(name);
  return sensitive ? 14 : 7;
}

// ---------- manifests ----------

function npmDeps(text) {
  const pkg = JSON.parse(text);
  return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
}

// Reads [dependencies] and [workspace.dependencies] from a Cargo.toml.
// shortcut: line-based TOML subset (name = "v" or name = { version = "v", ... }), switch to a real parser if manifests get multi-line tables.
function cargoDeps(text) {
  const deps = {};
  let inDeps = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line.startsWith('[')) {
      inDeps = line === '[dependencies]' || line === '[workspace.dependencies]';
      continue;
    }
    if (!inDeps || !line) continue;
    const m = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!m) continue;
    const plain = /^"([^"]+)"$/.exec(m[2]);
    const table = /version\s*=\s*"([^"]+)"/.exec(m[2]);
    const version = plain ? plain[1] : table ? table[1] : null;
    if (version) deps[m[1]] = version.replace(/^=\s*/, ''); // path, git or workspace = true deps have no registry version
  }
  return deps;
}

function isNpmManifest(p) {
  return /(^|\/)package\.json$/.test(p) && !p.includes('node_modules/');
}
function isCargoManifest(p) {
  return /^contracts\/(.+\/)?Cargo\.toml$/.test(p);
}

// files: { path: content } for base and head. Returns deps added or changed in head.
function diffDeps(baseFiles, headFiles) {
  const out = [];
  for (const [path, text] of Object.entries(headFiles)) {
    const ecosystem = isNpmManifest(path) ? 'npm' : isCargoManifest(path) ? 'crates.io' : null;
    if (!ecosystem) continue;
    const parse = ecosystem === 'npm' ? npmDeps : cargoDeps;
    const head = parse(text);
    const base = baseFiles[path] ? parse(baseFiles[path]) : {};
    for (const [name, version] of Object.entries(head)) {
      if (base[name] !== version) out.push({ ecosystem, name, version, file: path });
    }
  }
  return out;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function loadManifests(sha) {
  const files = {};
  for (const p of git(['ls-tree', '-r', '--name-only', sha]).split('\n')) {
    if (isNpmManifest(p) || isCargoManifest(p)) files[p] = git(['show', `${sha}:${p}`]);
  }
  return files;
}

// ---------- network (fetchImpl is injectable for tests) ----------

async function getJson(fetchImpl, url, init) {
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.json();
}

// Normalized: [{ version, published: Date, deprecated: string|null, yanked: bool }]
async function fetchRegistry(fetchImpl, ecosystem, name) {
  if (ecosystem === 'npm') {
    const doc = await getJson(fetchImpl, `https://registry.npmjs.org/${name.replace('/', '%2f')}`);
    return Object.entries(doc.versions || {}).map(([version, meta]) => ({
      version,
      published: new Date(doc.time?.[version]),
      deprecated: meta.deprecated || null,
      yanked: false,
    }));
  }
  const doc = await getJson(fetchImpl, `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`, {
    headers: { 'User-Agent': 'stellar-split-version-guard (github.com/vestival/stellar-split)' },
  });
  return (doc.versions || []).map((v) => ({
    version: v.num,
    published: new Date(v.created_at),
    deprecated: null,
    yanked: !!v.yanked,
  }));
}

// shortcut: reads severity labels only (GHSA database_specific.severity and similar), no CVSS vector scoring, and ignores OSV pagination.
async function fetchVulns(fetchImpl, ecosystem, name, version) {
  const doc = await getJson(fetchImpl, 'https://api.osv.dev/v1/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package: { name, ecosystem }, version }),
  });
  return (doc.vulns || []).map((v) => {
    const labels = [v.database_specific?.severity];
    for (const a of v.affected || []) labels.push(a.database_specific?.severity, a.ecosystem_specific?.severity);
    const found = labels.filter((s) => typeof s === 'string').map((s) => s.toUpperCase());
    const severity = found.includes('CRITICAL') ? 'CRITICAL' : found.includes('HIGH') ? 'HIGH' : found[0] || null;
    return { id: v.id, severity };
  });
}

// ---------- checks ----------

async function checkDep(dep, { fetchImpl = globalThis.fetch, now = new Date(), policy = [] } = {}) {
  const problems = [];
  const fail = (reason, expected = '') => problems.push({ ...dep, expected, reason });
  const { ecosystem, name, version } = dep;

  if (ecosystem === 'npm' && /^(file|link|workspace):/.test(version)) return problems;
  const parsed = parseVersion(version);
  if (!parsed) {
    fail(ecosystem === 'npm' ? 'not an exact version (ranges like ^ ~ * > x are not allowed)' : 'not a plain x.y.z version');
    return problems;
  }
  if (parsed.pre) fail('pre-release version');

  const approved = policy.find((p) => p.ecosystem === ecosystem && p.name === name);
  if (approved && parseVersion(approved.version) && compareVersions(version, approved.version) < 0) {
    fail('older than the approved version', approved.version);
  }

  const days = cooldownDays(name);
  const cutoff = now.getTime() - days * DAY;
  try {
    const releases = await fetchRegistry(fetchImpl, ecosystem, name);
    const own = releases.find((r) => r.version === version);
    if (!own) fail('version not found in the registry');
    else {
      if (own.deprecated) fail(`deprecated on npm: ${own.deprecated}`);
      if (own.yanked) fail('yanked on crates.io');
      if (own.published.getTime() > cutoff) fail(`published less than ${days} days ago (cooldown)`);
    }
    const eligible = releases
      .filter((r) => parseVersion(r.version) && !parseVersion(r.version).pre && !r.deprecated && !r.yanked)
      .filter((r) => r.published.getTime() <= cutoff)
      .sort((a, b) => compareVersions(b.version, a.version))[0];
    if (eligible && compareVersions(version, eligible.version) < 0) {
      fail(`outdated, newest release past its ${days}-day cooldown is ${eligible.version}`, eligible.version);
    }
  } catch (err) {
    fail(`registry lookup failed: ${err.message}`);
  }

  try {
    for (const v of await fetchVulns(fetchImpl, ecosystem, name, version)) {
      if (!v.severity) fail(`unscored advisory ${v.id}`);
      else if (v.severity === 'HIGH' || v.severity === 'CRITICAL') fail(`${v.severity} advisory ${v.id}`);
    }
  } catch (err) {
    fail(`OSV lookup failed: ${err.message}`);
  }
  return problems;
}

async function checkDeps(deps, opts) {
  const all = [];
  for (const dep of deps) all.push(...(await checkDep(dep, opts)));
  return all;
}

function renderReport(deps, problems) {
  const lines = ['## LLM outdated version guard', ''];
  if (!problems.length) {
    lines.push(`Checked ${deps.length} added or changed dependencies. No problems found.`);
    return lines.join('\n') + '\n';
  }
  lines.push(`Found ${problems.length} problem(s) in ${deps.length} added or changed dependencies.`, '');
  lines.push('| Dependency | Ecosystem | File | Proposed | Expected | Reason |', '|---|---|---|---|---|---|');
  for (const p of problems) {
    const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| \`${cell(p.name)}\` | ${p.ecosystem} | ${cell(p.file)} | ${cell(p.version)} | ${cell(p.expected || '-')} | ${cell(p.reason)} |`);
  }
  lines.push('', 'Pin each dependency to the expected version, or to the newest stable release that has passed its cooldown.');
  return lines.join('\n') + '\n';
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { base: { type: 'string' }, head: { type: 'string' }, policy: { type: 'string' }, report: { type: 'string' } },
  });
  if (!values.base || !values.head) throw new Error('--base and --head are required');
  const policy = values.policy ? JSON.parse(readFileSync(values.policy, 'utf8')).packages || [] : [];
  const deps = diffDeps(loadManifests(values.base), loadManifests(values.head));
  const problems = await checkDeps(deps, { policy });
  const report = renderReport(deps, problems);
  if (values.report) writeFileSync(values.report, report);
  process.stdout.write(report);
  return problems.length ? 1 : 0;
}

module.exports = { parseVersion, compareVersions, cooldownDays, npmDeps, cargoDeps, diffDeps, checkDep, checkDeps, renderReport };

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
