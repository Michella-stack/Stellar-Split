// Local stand-in for the API's SEP-53 sign-in: the same message format as apps/api, and a real check of the
// ed25519 signature over SHA-256("Stellar Signed Message:\n" + message). Nothing is sent to the network.

import { Keypair } from '@stellar/stellar-sdk';

const PREFIX = 'Stellar Signed Message:\n';
const TTL_MS = 5 * 60_000;

/** @param {string} address */
export function buildChallenge(address) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/[+/=]/g, '');
  const expires = new Date(Date.now() + TTL_MS).toISOString();
  return { challenge: `Stellar-Split sign-in\nAddress: ${address}\nNonce: mock.${nonce}\nExpires: ${expires}`, expiresAt: expires };
}

/**
 * @param {string} address
 * @param {string} challenge
 * @param {string} signature base64 or hex
 */
export async function verifySignedMessage(address, challenge, signature) {
  if (typeof challenge !== 'string' || typeof signature !== 'string') return false;
  const expires = /\nExpires: (\S+)$/.exec(challenge)?.[1];
  if (!expires || Date.parse(expires) < Date.now() || !challenge.includes(`\nAddress: ${address}\n`)) return false;
  const sig = /^[0-9a-f]{128}$/i.test(signature) ? hexBytes(signature) : Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  if (sig.length !== 64) return false;
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PREFIX + challenge)));
  try {
    return Keypair.fromPublicKey(address).verify(hash, sig);
  } catch {
    return false;
  }
}

/** @param {string} hex */
function hexBytes(hex) {
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
}
