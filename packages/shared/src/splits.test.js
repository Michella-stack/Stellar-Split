import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkExactSplit, splitEqual } from './splits.js';
import { toStroops } from './money.js';

describe('splitEqual', () => {
  it('splits evenly when it divides', () => {
    const shares = splitEqual(toStroops('1600'), ['you', 'mateo', 'valentina', 'jake'], 'mateo');
    assert.deepEqual([...shares.values()], Array(4).fill(toStroops('400')));
  });

  it('gives the remainder to the payer', () => {
    const shares = splitEqual(toStroops('25'), ['a', 'b', 'c'], 'b');
    assert.equal(shares.get('a'), 83_333_333n);
    assert.equal(shares.get('b'), 83_333_334n);
    assert.equal(shares.get('c'), 83_333_333n);
  });

  it('gives the remainder to the first participant when the payer is not in the split', () => {
    const shares = splitEqual(toStroops('10'), ['a', 'b', 'c'], 'agent');
    assert.equal(shares.get('a'), 33_333_334n);
  });

  it('always adds up to the total', () => {
    for (const total of [1n, 2n, 7n, 99_999_999n, toStroops('63.20')]) {
      for (let n = 1; n <= 7; n++) {
        const ids = Array.from({ length: n }, (_, i) => `m${i}`);
        const shares = splitEqual(total, ids, 'm0');
        assert.equal([...shares.values()].reduce((a, b) => a + b, 0n), total);
      }
    }
  });

  it('rejects empty or duplicate participants', () => {
    assert.throws(() => splitEqual(1n, [], 'a'));
    assert.throws(() => splitEqual(1n, ['a', 'a'], 'a'));
  });
});

describe('checkExactSplit', () => {
  it('accepts shares that add up', () => {
    assert.deepEqual(checkExactSplit(toStroops('60'), [toStroops('20'), toStroops('25'), toStroops('15')]), {
      ok: true,
      sum: toStroops('60'),
      difference: 0n,
    });
  });

  it('reports what is left to assign', () => {
    const result = checkExactSplit(toStroops('60'), [toStroops('20'), toStroops('25')]);
    assert.equal(result.ok, false);
    assert.equal(result.difference, toStroops('15'));
  });

  it('reports an overshoot as a negative difference', () => {
    assert.equal(checkExactSplit(toStroops('10'), [toStroops('11')]).difference, -toStroops('1'));
  });

  it('rejects negative shares even when the sum matches', () => {
    assert.equal(checkExactSplit(toStroops('10'), [toStroops('15'), -toStroops('5')]).ok, false);
  });
});
