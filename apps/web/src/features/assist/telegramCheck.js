// Simulated "check on Telegram" for a payment, for the demo and for screen recordings.
// Nothing here talks to Telegram, the API or the chain. It models the draft in
// docs/security/diagrams/verification-flow.md so the web app can show the same steps:
// Stellar Assist asks the payer, the payer presses a button, the server checks the Telegram ID,
// and the payment is cleared or denied.

import { toStroops } from '@shared/money.js';

/** Draft thresholds in USD-equivalent, from docs/security/verification-policy.md. They may change. */
export const TIER_1_ABOVE = '2.00';
export const TIER_2_ABOVE = '40.00';
export const CHECK_TIMEOUT_MINUTES = 10;

/**
 * @typedef {'asked' | 'confirmed' | 'cancelled' | 'timed-out' | 'cleared' | 'denied'} CheckState
 * @typedef {'confirm' | 'cancel' | 'timeout' | 'id-match' | 'id-mismatch'} CheckEvent
 */

/**
 * Which check a payment needs. 0: server policy only. 1: payee check. 2: step-up.
 * @param {string} amount decimal string
 * @returns {0 | 1 | 2}
 */
export function checkTier(amount) {
  const value = toStroops(amount);
  if (value > toStroops(TIER_2_ABOVE)) return 2;
  if (value > toStroops(TIER_1_ABOVE)) return 1;
  return 0;
}

/**
 * Moves the check along. An event that does not apply in the current state changes nothing.
 * @param {CheckState} state
 * @param {CheckEvent} event
 * @returns {CheckState}
 */
export function nextState(state, event) {
  if (state === 'asked') {
    if (event === 'confirm') return 'confirmed';
    if (event === 'cancel') return 'cancelled';
    if (event === 'timeout') return 'timed-out';
  }
  if (state === 'confirmed') {
    if (event === 'id-match') return 'cleared';
    if (event === 'id-mismatch') return 'denied';
  }
  return state;
}

/** @param {CheckState} state */
export const isDenied = (state) => state === 'cancelled' || state === 'timed-out' || state === 'denied';

/** @param {CheckState} state */
export const isFinished = (state) => state === 'cleared' || isDenied(state);
