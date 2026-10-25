import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { netBalances, suggestTransfers } from './balances.js';
import { fromStroops, toStroops } from './money.js';

const decimal = (net) => Object.fromEntries([...net].map(([id, v]) => [id, fromStroops(v, { minDecimals: 2 })]));
const total = (net) => [...net.values()].reduce((a, b) => a + b, 0n);

// BUILD-FOCUS item 3: balances checked against a hand calculation for 3 members and 5 expenses.
describe('3 members, 5 expenses (hand calculation)', () => {
  const members = ['ana', 'bruno', 'carla'];
  const expenses = [
    // 1. Dinner 90.00 by Ana, equal: 30.00 each.
    { amount: '90.00', paidBy: 'ana', split: { type: 'equal', participants: members } },
    // 2. Taxi 25.00 by Bruno, equal: 8.3333333 each, the 0.0000001 remainder goes to Bruno (8.3333334).
    { amount: '25.00', paidBy: 'bruno', split: { type: 'equal', participants: members } },
    // 3. Tickets 60.00 by Carla, exact: Ana 20, Bruno 25, Carla 15.
    {
      amount: '60.00',
      paidBy: 'carla',
      split: { type: 'exact', shares: [{ memberId: 'ana', amount: '20' }, { memberId: 'bruno', amount: '25' }, { memberId: 'carla', amount: '15' }] },
    },
    // 4. Groceries 47.50 by Ana, equal between Ana and Bruno only: 23.75 each.
    { amount: '47.50', paidBy: 'ana', split: { type: 'equal', participants: ['ana', 'bruno'] } },
    // 5. Hotel 120.00 by Bruno, exact: 40 each.
    {
      amount: '120.00',
      paidBy: 'bruno',
      split: { type: 'exact', shares: members.map((memberId) => ({ memberId, amount: '40.00' })) },
    },
  ];
  // Ana:   paid 137.50, shares 30 + 8.3333333 + 20 + 23.75 + 40 = 122.0833333 → +15.4166667
  // Bruno: paid 145.00, shares 30 + 8.3333334 + 25 + 23.75 + 40 = 127.0833334 → +17.9166666
  // Carla: paid  60.00, shares 30 + 8.3333333 + 15 +  0    + 40 =  93.3333333 → −33.3333333

  it('matches the hand calculation', () => {
    const net = netBalances(members, expenses);
    assert.deepEqual(decimal(net), { ana: '15.4166667', bruno: '17.9166666', carla: '-33.3333333' });
    assert.equal(total(net), 0n);
  });

  it('settles with two transfers from Carla', () => {
    const transfers = suggestTransfers(netBalances(members, expenses));
    assert.deepEqual(
      transfers.map((t) => ({ ...t, amount: fromStroops(t.amount) })),
      [
        { from: 'carla', to: 'bruno', amount: '17.9166666' },
        { from: 'carla', to: 'ana', amount: '15.4166667' },
      ],
    );
  });

  it('reaches zero after a partial and then a full settlement', () => {
    const half = netBalances(members, expenses, [{ from: 'carla', to: 'bruno', amount: '10.00' }]);
    assert.equal(fromStroops(half.get('carla'), { minDecimals: 2 }), '-23.3333333');
    const done = netBalances(members, expenses, [
      { from: 'carla', to: 'bruno', amount: '17.9166666' },
      { from: 'carla', to: 'ana', amount: '15.4166667' },
    ]);
    assert.deepEqual([...done.values()], [0n, 0n, 0n]);
  });
});

describe('netBalances', () => {
  it('rejects unknown members and exact splits that do not add up', () => {
    assert.throws(() => netBalances(['a'], [{ amount: '1', paidBy: 'x', split: { type: 'equal', participants: ['a'] } }]));
    assert.throws(() =>
      netBalances(['a', 'b'], [{ amount: '10', paidBy: 'a', split: { type: 'exact', shares: [{ memberId: 'b', amount: '9' }] } }]),
    );
  });
});

describe('suggestTransfers', () => {
  it('returns nothing when everyone is square', () => {
    assert.deepEqual(suggestTransfers(new Map([['a', 0n], ['b', 0n]])), []);
  });

  it('is deterministic for ties', () => {
    const net = new Map([['z', -toStroops('5')], ['y', -toStroops('5')], ['x', toStroops('10')]]);
    assert.deepEqual(suggestTransfers(net).map((t) => t.from), ['y', 'z']);
  });
});
