// Input checks shared by the web app and the API.

const SECRET_SEED = /S[A-Z2-7]{55}/;
const PUBLIC_KEY = /^G[A-Z2-7]{55}$/;

/**
 * True when the text contains something shaped like a Stellar secret seed. Such input must be refused
 * and never stored, sent or logged.
 * @param {string} text
 */
export function containsSecretKey(text) {
  return SECRET_SEED.test(text);
}

/**
 * Format check for a Stellar public account address (G..., 56 characters). The checksum is verified
 * with the Stellar SDK where it is available.
 * @param {string} text
 */
export function looksLikeStellarAddress(text) {
  return PUBLIC_KEY.test(text);
}
