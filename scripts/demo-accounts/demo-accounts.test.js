import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from './demo-accounts.js';
import { REPO_ROOT, isInside, storePath } from './store.js';

describe('storePath', () => {
  it('refuses to keep secret keys anywhere inside the repository', () => {
    assert.throws(() => storePath({ DEMO_ACCOUNTS_FILE: join(REPO_ROOT, 'demo-accounts.json') }), /inside a git repository/);
    assert.throws(() => storePath({ DEMO_ACCOUNTS_FILE: join(REPO_ROOT, 'scripts', 'x', 'keys.json') }), /inside a git repository/);
  });

  it('refuses any other git work tree too', () => {
    const other = mkdtempSync(join(tmpdir(), 'other-repo-'));
    mkdirSync(join(other, '.git'));
    assert.throws(() => storePath({ DEMO_ACCOUNTS_FILE: join(other, 'nested', 'keys.json') }), /inside a git repository/);
  });

  it('accepts a path outside the repository and defaults to the home directory', () => {
    const outside = join(tmpdir(), 'stellar-split-test.json');
    assert.equal(storePath({ DEMO_ACCOUNTS_FILE: outside }), outside);
    assert.match(storePath({}), /\.stellar-split[/\\]demo-accounts\.json$/);
  });

  it('isInside handles sibling folders with a shared prefix', () => {
    assert.equal(isInside('/a/repo', '/a/repo-other/file'), false);
    assert.equal(isInside('/a/repo', '/a/repo/file'), true);
  });
});

describe('parseArgs', () => {
  it('reads names and --usdc', () => {
    assert.deepEqual(parseArgs(['alex', 'mateo', '--usdc', '25.5']), { positional: ['alex', 'mateo'], usdc: '25.5' });
  });

  it('rejects a bad amount', () => {
    assert.throws(() => parseArgs(['--usdc', '-3']));
    assert.throws(() => parseArgs(['--usdc', '1.123456789']));
    assert.throws(() => parseArgs(['--usdc']));
  });
});
