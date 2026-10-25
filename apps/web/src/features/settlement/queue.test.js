import { describe, expect, it } from 'vitest';
import { queueAfter, totalOwed } from './queue.js';

describe('queueAfter', () => {
  it('returns who is left to pay after the current member', () => {
    expect(queueAfter(['m-a', 'm-b', 'm-c'], 'm-a')).toEqual(['m-b', 'm-c']);
    expect(queueAfter(['m-a', 'm-b', 'm-c'], 'm-b')).toEqual(['m-c']);
    expect(queueAfter(['m-a', 'm-b', 'm-c'], 'm-c')).toEqual([]);
  });

  it.each([
    ['no queue', undefined, 'm-a'],
    ['a queue that is not a list', 'm-a,m-b', 'm-a'],
    ['a queue with something that is not an id', ['m-a', { id: 'm-b' }], 'm-a'],
    ['a queue that does not contain the current member', ['m-b', 'm-c'], 'm-a'],
  ])('gives nothing for %s', (_, queue, current) => {
    expect(queueAfter(queue, current)).toEqual([]);
  });
});

describe('totalOwed', () => {
  it('adds the transfers exactly, without floating point', () => {
    expect(totalOwed([{ to: 'a', amount: '0.10' }, { to: 'b', amount: '0.20' }])).toBe('0.30');
    expect(totalOwed([{ to: 'a', amount: '364.60' }, { to: 'b', amount: '12.3456789' }])).toBe('376.9456789');
    expect(totalOwed([])).toBe('0.00');
  });
});
