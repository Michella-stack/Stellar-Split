// Scripted Stellar Assist for the demo. Understands a few phrases in English, Spanish and Portuguese; the real agent replaces this later.
// The spending decision mirrors the server-side policy: the server stays the authority.

import { toStroops } from '@shared/money.js';
import { containsSecretKey } from '@shared/validation.js';

/**
 * @typedef {{ kind: 'secret' } | { kind: 'add-expense', amount: string, description: string, ways: number | null }
 *   | { kind: 'pay', amount: string, to: string } | { kind: 'what-owe' } | { kind: 'pay-internet' } | { kind: 'telegram-check' } | { kind: 'unknown' }} Intent
 */

const AMOUNT = '(\\d+(?:[.,]\\d{1,7})?)';

/**
 * @param {string} text
 * @returns {Intent}
 */
export function parseIntent(text) {
  if (containsSecretKey(text)) return { kind: 'secret' };
  // Lower case and drop accents so "¿Qué debo?" and "Pagar à Mateo" match the same patterns as plain ASCII.
  const t = text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/what do i owe|how much do i owe|my balance|que debo|que devo|cuanto debo|mi saldo|quanto devo|meu saldo/.test(t)) return { kind: 'what-owe' };
  if (/telegram/.test(t)) return { kind: 'telegram-check' };
  if (/internet share|parte (?:de|da) internet/.test(t)) return { kind: 'pay-internet' };

  const pay = new RegExp(`\\b(?:pay|pagar|paga)\\s+([a-z]+)\\s+\\$?${AMOUNT}`).exec(t);
  if (pay) return { kind: 'pay', to: pay[1], amount: normalize(pay[2]) };

  const expense = new RegExp(`\\$?${AMOUNT}\\s+(?:usdc\\s+)?(?:for|para|pra)\\s+(?:(?:la|el|las|los|a|o|as|os)\\s+)?([a-z][a-z ]*?)(?:,|\\s+split|\\s+divid|\\s+repart|$)`).exec(t);
  if (expense) {
    const ways = /split\s+(\d+)\s+ways|(?:dividid[oa]|dividir|repartid[oa]|repartir)\s+(?:entre|por|em|en)\s+(\d+)/.exec(t);
    return { kind: 'add-expense', amount: normalize(expense[1]), description: capitalize(expense[2].trim()), ways: ways ? Number(ways[1] ?? ways[2]) : null };
  }
  return { kind: 'unknown' };
}

/**
 * What the agent may do with a payment under the owner's rules.
 * @param {string} amount decimal string
 * @param {{ maxPerPayment: string, approvalAbove: string, dailyCap: string }} policy
 * @param {string} spentToday decimal string
 * @returns {'auto' | 'approval' | 'over-limit' | 'over-daily-cap'}
 */
export function decide(amount, policy, spentToday) {
  const value = toStroops(amount);
  if (value > toStroops(policy.maxPerPayment)) return 'over-limit';
  if (toStroops(spentToday) + value > toStroops(policy.dailyCap)) return 'over-daily-cap';
  if (value > toStroops(policy.approvalAbove)) return 'approval';
  return 'auto';
}

/** @param {string} v */
function normalize(v) {
  const dotted = v.replace(',', '.');
  return dotted.includes('.') ? dotted : `${dotted}.00`;
}

/** @param {string} s */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
