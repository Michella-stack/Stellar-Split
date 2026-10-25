// Agent spend caps (PRD 7.4, issue #13). Pure: the caller passes what the agent has already committed and gets a decision.
// No guardrail may depend on the agent behaving, so the API applies this before an agent can start any payment.

import { fromStroops, toStroops } from '../../shared/src/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** PRD 7.4 defaults, in USDC. "Per month" is a rolling 30 days, like "per day" is a rolling 24 hours. */
export const DEFAULT_CAPS = Object.freeze({ perPayment: '25', perDay: '50', perMonth: '200' });

/**
 * Settlement intent states that may have moved money, so they count against the caps. An expired intent can still
 * settle and a needs_review one already did. Cancelled and failed ones count only if they later move to needs_review.
 */
export const COUNTED_STATUSES = Object.freeze(['reserved', 'settled', 'expired', 'needs_review']);

/**
 * @typedef {{ perPayment: string, perDay: string, perMonth: string }} Caps
 * @typedef {{ amount: string, at: string, status: string }} Commitment
 * @typedef {{ ok: true } | { ok: false, code: 'AGENT_CAP_PER_PAYMENT' | 'AGENT_CAP_PER_DAY' | 'AGENT_CAP_PER_MONTH',
 *   message: string, details: { limit: string, spent: string, window: string } }} Decision
 */

/**
 * Decides whether an agent may commit `amount` more.
 * @param {{ amount: bigint, committed: Commitment[], caps?: Caps, now: Date }} input
 *   `amount` in stroops; `committed` is the agent's earlier intents, which must not include this payment.
 * @returns {Decision}
 */
export function checkSpend({ amount, committed, caps = DEFAULT_CAPS, now }) {
  const t = now.getTime();
  const spentWithin = (ms) =>
    committed
      .filter((c) => COUNTED_STATUSES.includes(c.status) && t - Date.parse(c.at) < ms)
      .reduce((sum, c) => sum + toStroops(c.amount), 0n);

  const rules = [
    ['AGENT_CAP_PER_PAYMENT', 'per payment', caps.perPayment, 0n],
    ['AGENT_CAP_PER_DAY', 'in 24 hours', caps.perDay, spentWithin(DAY_MS)],
    ['AGENT_CAP_PER_MONTH', 'in 30 days', caps.perMonth, spentWithin(30 * DAY_MS)],
  ];
  for (const [code, window, cap, spent] of rules) {
    const limit = toStroops(cap);
    if (spent + amount > limit) {
      const fmt = (v) => fromStroops(v, { minDecimals: 2 });
      return { ok: false, code, message: `This payment would take the agent over its limit of ${fmt(limit)} USDC ${window}`, details: { limit: fmt(limit), spent: fmt(spent), window } };
    }
  }
  return { ok: true };
}
