import { describe, expect, it } from 'vitest';
import { latestActivity } from './latestActivity.js';

const item = (id, type, createdAt) => ({ id, type, createdAt });

describe('latestActivity', () => {
  it('mixes expenses and payments, newest first, and keeps only the limit', () => {
    const items = [
      item('e1', 'expense', '2026-10-20T10:00:00Z'),
      item('s1', 'settlement', '2026-10-24T09:00:00Z'),
      item('e2', 'expense', '2026-10-22T18:00:00Z'),
      item('s2', 'settlement', '2026-10-25T08:00:00Z'),
    ];
    expect(latestActivity(items, 3).map((i) => i.id)).toEqual(['s2', 's1', 'e2']);
  });

  it('does not change the list it was given and copes with an empty one', () => {
    const items = [item('a', 'expense', '2026-10-20T10:00:00Z'), item('b', 'settlement', '2026-10-21T10:00:00Z')];
    latestActivity(items, 1);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(latestActivity([], 3)).toEqual([]);
  });
});
