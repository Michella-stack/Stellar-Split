import { containsSecretKey, isValidStellarAddress } from '@shared/validation.js';

/**
 * Checks a Stellar address typed or pasted by a person, including its checksum.
 * @param {string} value
 * @returns {string | null} an error message, or null when valid or empty
 */
export function addressError(value) {
  const text = value.trim();
  if (!text) return null;
  if (containsSecretKey(text)) {
    return 'That is a secret key, not an address. Never share it. Ask your friend for their public address (it starts with G).';
  }
  if (!isValidStellarAddress(text)) return 'That is not a Stellar address. It starts with G and has 56 characters.';
  return null;
}
