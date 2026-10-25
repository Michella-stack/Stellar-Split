import { describe, expect, it } from 'vitest';
import { DEMO_KEY, DEMO_STATE_KEY, createDemoSwitch } from './demoMode.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map };
}

describe('demo switch', () => {
  it('is off by default and remembers being turned on', () => {
    const storage = memoryStorage();
    const demo = createDemoSwitch(() => storage);
    expect(demo.isOn()).toBe(false);
    demo.set(true);
    expect(demo.isOn()).toBe(true);
    expect(storage.map.get(DEMO_KEY)).toBe('1');
  });

  it('forgets the demo data when it is turned off', () => {
    const storage = memoryStorage();
    const demo = createDemoSwitch(() => storage);
    demo.set(true);
    storage.setItem(DEMO_STATE_KEY, '{"groups":[]}');
    demo.set(false);
    expect(demo.isOn()).toBe(false);
    expect(storage.map.has(DEMO_STATE_KEY)).toBe(false);
  });

  it('stays off when storage is blocked', () => {
    const demo = createDemoSwitch(() => {
      throw new Error('SecurityError');
    });
    expect(demo.isOn()).toBe(false);
    expect(() => demo.set(true)).not.toThrow();
  });
});
