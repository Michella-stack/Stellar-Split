// Where demo account keys live: outside the repository, readable only by the current user.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_STORE = join(homedir(), '.stellar-split', 'demo-accounts.json');

/** True when `file` is inside `root` (or is `root`). */
export function isInside(root, file) {
  const rel = relative(resolve(root), resolve(file));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * The git work tree that contains `file`, or null. Walks up from the file's folder; a `.git` file or folder
 * marks a work tree (worktrees use a `.git` file).
 * @param {string} file
 */
export function gitWorkTreeOf(file) {
  let dir = dirname(resolve(file));
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The store path, from DEMO_ACCOUNTS_FILE or the default. Refuses any path inside this repository or any
 * other git work tree, so secret keys can never end up in a commit.
 * @param {Record<string, string | undefined>} env
 */
export function storePath(env = process.env) {
  const file = resolve(env.DEMO_ACCOUNTS_FILE ?? DEFAULT_STORE);
  const tree = gitWorkTreeOf(file);
  if (isInside(REPO_ROOT, file) || tree) {
    throw new Error(`Refusing to keep secret keys inside a git repository (${tree ?? REPO_ROOT}): ${file}`);
  }
  return file;
}

/** @returns {{ accounts: Record<string, { publicKey: string, secret: string, createdAt: string }> }} */
export function load(file) {
  if (!existsSync(file)) return { accounts: {} };
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function save(file, data) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  chmodSync(file, 0o600);
}
