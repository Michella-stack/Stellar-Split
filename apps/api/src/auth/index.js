// Sign-in with a Stellar wallet (SEP-53 signed message) and bearer sessions. Agents use pre-issued tokens.

import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ACCOUNT_VERSION = 6 << 3; // 'G' addresses
const SEP53_PREFIX = 'Stellar Signed Message:\n';
const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');

const sha256 = (data) => createHash('sha256').update(data).digest();

function crc16xmodem(bytes) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/**
 * Raw 32-byte ed25519 public key of a G address, or null when the address is malformed or its checksum fails.
 * @param {string} address
 */
export function decodeAddress(address) {
  if (typeof address !== 'string' || !/^G[A-Z2-7]{55}$/.test(address)) return null;
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of address) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const bytes = Buffer.from(out); // 1 version + 32 key + 2 checksum
  if (bytes.length !== 35 || bytes[0] !== ACCOUNT_VERSION) return null;
  const crc = crc16xmodem(bytes.subarray(0, 33));
  if (bytes.readUInt16LE(33) !== crc) return null;
  return bytes.subarray(1, 33);
}

/** @param {Buffer} rawKey 32 bytes */
export function encodeAddress(rawKey) {
  const payload = Buffer.concat([Buffer.from([ACCOUNT_VERSION]), rawKey]);
  const crc = Buffer.alloc(2);
  crc.writeUInt16LE(crc16xmodem(payload));
  const bytes = Buffer.concat([payload, crc]);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

/**
 * Checks a SEP-53 signature: ed25519 over SHA-256("Stellar Signed Message:\n" + message).
 * @param {string} address signer's G address
 * @param {string} message
 * @param {string} signature base64 or hex
 */
export function verifySignedMessage(address, message, signature) {
  const raw = decodeAddress(address);
  if (!raw || typeof signature !== 'string') return false;
  const sig = /^[0-9a-f]{128}$/i.test(signature) ? Buffer.from(signature, 'hex') : Buffer.from(signature, 'base64');
  if (sig.length !== 64) return false;
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI, raw]), format: 'der', type: 'spki' });
  return verify(null, sha256(SEP53_PREFIX + message), key, sig);
}

/**
 * In-memory challenges and sessions. A restart signs everyone out, which is acceptable for the testnet build.
 * @param {{ sessionTtlMs?: number, challengeTtlMs?: number, agentTokens?: Map<string, string>, now?: () => number }} options
 *   agentTokens maps sha256(token) hex to the agent's G address
 */
export function createAuth({ sessionTtlMs = 12 * 3600_000, challengeTtlMs = 5 * 60_000, agentTokens = new Map(), now = Date.now } = {}) {
  const challenges = new Map(); // nonce -> { address, message, expires }
  const sessions = new Map(); // sha256(token) hex -> { address, expires }

  return {
    challenge(address) {
      if (!decodeAddress(address)) return null;
      const nonce = randomBytes(16).toString('hex');
      const expires = now() + challengeTtlMs;
      const message = `Stellar-Split sign-in\nAddress: ${address}\nNonce: ${nonce}\nExpires: ${new Date(expires).toISOString()}`;
      challenges.set(nonce, { address, message, expires });
      return { challenge: message, expiresAt: new Date(expires).toISOString() };
    },

    verify(address, challenge, signature) {
      const nonce = /\nNonce: ([0-9a-f]{32})\n/.exec(String(challenge))?.[1];
      const entry = nonce && challenges.get(nonce);
      if (!entry || entry.address !== address || entry.message !== challenge || entry.expires < now()) return null;
      challenges.delete(nonce); // single use, even when the signature is wrong
      if (!verifySignedMessage(address, challenge, signature)) return null;
      const token = randomBytes(32).toString('base64url');
      const expires = now() + sessionTtlMs;
      sessions.set(sha256(token).toString('hex'), { address, expires });
      return { token, address, expiresAt: new Date(expires).toISOString() };
    },

    /** @returns {{ kind: 'human' | 'agent', address: string } | null} */
    principal(authorization) {
      const token = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1];
      if (!token) return null;
      const hash = sha256(token).toString('hex');
      const session = sessions.get(hash);
      if (session) {
        if (session.expires >= now()) return { kind: 'human', address: session.address };
        sessions.delete(hash);
      }
      for (const [stored, address] of agentTokens) {
        if (timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(hash, 'hex'))) return { kind: 'agent', address };
      }
      return null;
    },
  };
}

/**
 * Parses AGENT_TOKENS: comma-separated "sha256hex=GADDRESS" pairs. Only token hashes are configured.
 * @param {string} [value]
 */
export function parseAgentTokens(value = '') {
  const map = new Map();
  for (const pair of value.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [hash, address] = pair.split('=');
    if (!/^[0-9a-f]{64}$/.test(hash ?? '') || !decodeAddress(address)) throw new Error('AGENT_TOKENS must be sha256hex=GADDRESS pairs');
    map.set(hash, address);
  }
  return map;
}
