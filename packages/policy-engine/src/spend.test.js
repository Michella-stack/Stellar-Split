import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toStroops } from '../../shared/src/index.js';
import { checkSpend, DEFAULT_CAPS } from './spend.js';

const now = new Date('2026-10-25T20:00:00Z');
const ago = (hours) => new Date(now.getTime() - hours * 3600_000).toISOString();
const check = (amount, committed = [], caps) => checkSpend({ amount: toStroops(amount), committed, caps, now });

test('defaults are the PRD 7.4 caps', () => {
  assert.deepEqual(DEFAULT_CAPS, { perPayment: '25', perDay: '50', perMonth: '200' });
});

test('per payment: exactly the cap passes, one stroop more does not', () => {
  assert.deepEqual(check('25'), { ok: true });
  const r = check('25.0000001');
  assert.equal(r.code, 'AGENT_CAP_PER_PAYMENT');
  assert.equal(r.details.limit, '25.00');
});

test('per day counts the last 24 hours only', () => {
  const committed = [{ amount: '25', at: ago(1), status: 'settled' }, { amount: '20', at: ago(23), status: 'settled' }];
  assert.deepEqual(check('5', committed), { ok: true });
  const r = check('5.01', committed);
  assert.equal(r.code, 'AGENT_CAP_PER_DAY');
  assert.deepEqual(r.details, { limit: '50.00', spent: '45.00', window: 'in 24 hours' });
  assert.deepEqual(check('25', [{ amount: '50', at: ago(24), status: 'settled' }]), { ok: true }, '24 hours ago is outside the window');
});

test('per month counts the last 30 days', () => {
  // 180 USDC over the last four days, none of it in the last 24 hours.
  const committed = [1, 2, 3, 4].map((d) => ({ amount: '45', at: ago(24 * d + 1), status: 'settled' }));
  const r = check('20.01', committed);
  assert.equal(r.code, 'AGENT_CAP_PER_MONTH');
  assert.equal(r.details.spent, '180.00');
  assert.deepEqual(check('20', committed), { ok: true });
  assert.deepEqual(check('25', [{ amount: '200', at: ago(24 * 30), status: 'settled' }]), { ok: true });
});

test('only states that may have moved money count', () => {
  for (const status of ['reserved', 'settled', 'expired', 'needs_review']) {
    assert.equal(check('1', [{ amount: '50', at: ago(1), status }]).code, 'AGENT_CAP_PER_DAY', status);
  }
  for (const status of ['cancelled', 'failed']) {
    assert.deepEqual(check('25', [{ amount: '50', at: ago(1), status }]), { ok: true }, status);
  }
});

test('owner caps replace the defaults', () => {
  const caps = { perPayment: '5', perDay: '10', perMonth: '20' };
  assert.equal(check('5.01', [], caps).code, 'AGENT_CAP_PER_PAYMENT');
  assert.equal(check('5', [{ amount: '6', at: ago(1), status: 'settled' }], caps).code, 'AGENT_CAP_PER_DAY');
});
