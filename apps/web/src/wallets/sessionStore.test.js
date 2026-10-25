import { describe, expect, it } from 'vitest';
import { SESSION_KEY, createSessionStore } from './sessionStore.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map };
}

const A = 'GAAA';
const session = { token: 't', address: A, expiresAt: '2026-10-26T05:00:00.000Z' };

describe('sessionStore', () => {
  it('keeps the session for the same account until it expires', () => {
    const storage = memoryStorage();
    const store = createSessionStore(() => storage, () => Date.parse('2026-10-25T18:00:00Z'));
    store.write(session);
    expect(store.read(A)).toEqual(session);
  });

  it('ignores a session of another account and an expired one', () => {
    const storage = memoryStorage();
    store(storage, '2026-10-25T18:00:00Z').write(session);
    expect(store(storage, '2026-10-25T18:00:00Z').read('GBBB')).toBeNull();
    expect(store(storage, '2026-10-26T06:00:00Z').read(A)).toBeNull();
  });

  it('clears it, and survives broken or blocked storage', () => {
    const storage = memoryStorage();
    const s = store(storage, '2026-10-25T18:00:00Z');
    s.write(session);
    s.write(null);
    expect(storage.map.has(SESSION_KEY)).toBe(false);
    storage.setItem(SESSION_KEY, '{not json');
    expect(s.read(A)).toBeNull();
    const blocked = createSessionStore(() => {
      throw new Error('SecurityError');
    });
    expect(() => blocked.write(session)).not.toThrow();
    expect(blocked.read(A)).toBeNull();
  });
});

function store(storage, iso) {
  return createSessionStore(() => storage, () => Date.parse(iso));
}
