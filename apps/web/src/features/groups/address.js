import { containsSecretKey, isValidStellarAddress } from '@shared/validation.js';
import { tNow } from '../../i18n/state.js';

/**
 * Checks a Stellar address typed or pasted by a person, including its checksum.
 * @param {string} value
 * @returns {string | null} an error message, or null when valid or empty
 */
export function addressError(value) {
  const text = value.trim();
  if (!text) return null;
  if (containsSecretKey(text)) {
    return tNow('address.secret');
  }
  if (!isValidStellarAddress(text)) return tNow('address.invalid');
  return null;
}
