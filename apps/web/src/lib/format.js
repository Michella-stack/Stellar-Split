// Display formatting for amounts that arrive as decimal strings. No floating point anywhere.
// Separators, dates and names follow the language in use (see i18n/state.js).

import { currentLocale, currentSeparators, tNow } from '../i18n/state.js';

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** @param {string} digits @param {string} separator */
export function groupThousands(digits, separator = ',') {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Formats a USDC decimal string as dollars with two decimals, rounding half up on the third decimal.
 * The sign is dropped: callers say "you owe" or "owes you" in words.
 * @param {string} value e.g. "-364.6", "1172.2000000"
 * @returns {string} e.g. "$364.60" and "$1,172.20" in English, "$1.172,20" in Spanish and Portuguese
 */
export function formatUsd(value) {
  if (!DECIMAL.test(value)) throw new Error(`Not a decimal string: ${value}`);
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  let cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (Number(fraction[2] ?? '0') >= 5) cents += 1n;
  const dollars = (cents / 100n).toString();
  const rest = (cents % 100n).toString().padStart(2, '0');
  const { group, decimal } = currentSeparators();
  return `$${groupThousands(dollars, group)}${decimal}${rest}`;
}

/**
 * @param {string} value decimal string
 * @returns {-1 | 0 | 1}
 */
export function signOf(value) {
  if (!DECIMAL.test(value)) throw new Error(`Not a decimal string: ${value}`);
  if (/^-?0+(\.0+)?$/.test(value)) return 0;
  return value.startsWith('-') ? -1 : 1;
}

/**
 * Shortens a Stellar address for display: GABC…WXYZ.
 * @param {string} address
 */
export function shortAddress(address) {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

/**
 * Up to two initials from a display name.
 * @param {string} name
 */
export function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts.at(-1)[0];
  return letters.toUpperCase();
}

/**
 * Short date for lists, e.g. "25 Oct".
 * @param {string} iso
 */
export function formatDate(iso) {
  return new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/**
 * How to name a member to the current person: "You" for themselves.
 * @param {{ id: string, displayName: string | null } | undefined} member
 * @param {string | null} meId
 */
export function memberName(member, meId) {
  if (!member) return tNow('common.someone');
  if (member.id === meId) return tNow('common.you');
  return member.displayName ?? tNow('common.member');
}
