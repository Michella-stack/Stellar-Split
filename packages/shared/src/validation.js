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
 * Format check for a Stellar public account address (G..., 56 characters), without the checksum.
 * @param {string} text
 */
export function looksLikeStellarAddress(text) {
  return PUBLIC_KEY.test(text);
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ED25519_PUBLIC_KEY_VERSION = 6 << 3; // 'G'

/**
 * Full check of a Stellar public account address: format, version byte and CRC16-XModem checksum
 * (SEP-23 strkey). Same result as StrKey.isValidEd25519PublicKey, without loading the SDK.
 * @param {string} text
 */
export function isValidStellarAddress(text) {
  if (!PUBLIC_KEY.test(text)) return false;
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of text) {
    buffer = (buffer << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  // 56 characters × 5 bits = 280 bits = 35 bytes: version, 32-byte key, 2-byte checksum.
  if (bytes.length !== 35 || bytes[0] !== ED25519_PUBLIC_KEY_VERSION) return false;
  if ((buffer & ((1 << bits) - 1)) !== 0) return false;
  const payload = bytes.slice(0, 33);
  const checksum = bytes[33] | (bytes[34] << 8);
  return crc16xmodem(payload) === checksum;
}

/** @param {number[]} data */
function crc16xmodem(data) {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}
