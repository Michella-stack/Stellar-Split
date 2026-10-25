// Sign-in with a Stellar wallet (SEP-53 signed message) and HMAC-signed bearer sessions. Agents use pre-issued tokens.

import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';

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
 * Stateless challenges and sessions signed with HMAC, so the API runs on serverless functions.
 * A challenge is single use: its nonce is burned in the repository (repo.useNonce) on the first verify.
 * @param {{ secret: string, repo: { useNonce: (nonce: string, expiresAt: string) => Promise<boolean> },
 *   sessionTtlMs?: number, challengeTtlMs?: number, agentTokens?: Map<string, string>, now?: () => number }} options
 *   agentTokens maps sha256(token) hex to the agent's G address
 */
export function createAuth({ secret, repo, sessionTtlMs = 12 * 3600_000, challengeTtlMs = 5 * 60_000, agentTokens = new Map(), now = Date.now }) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  const mac = (text) => createHmac('sha256', secret).update(text).digest('base64url');
  // Compare byte lengths: timingSafeEqual throws if they differ, and a non-ASCII tag can match in string length.
  const same = (a, b) => {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  };
  const message = (address, nonce, expires) =>
    `Stellar-Split sign-in\nAddress: ${address}\nNonce: ${nonce}\nExpires: ${new Date(expires).toISOString()}`;

  const linkMessage = (owner, agent, nonce, expires) =>
    `Stellar Split agent link\nOwner: ${owner}\nAgent: ${agent}\nNonce: ${nonce}\nExpires: ${new Date(expires).toISOString()}`;
  const knownAgents = new Set(agentTokens.values());

  return {
    /** True when `address` is the address of a configured agent token. */
    isAgent: (address) => knownAgents.has(address),

    /** Agent link challenge (ADR 0005): the owner signs it with SEP-53. Same HMAC and single-use nonce as sign-in. */
    linkChallenge(owner, agent) {
      const expires = now() + challengeTtlMs;
      const id = randomBytes(16).toString('base64url');
      const nonce = `${id}.${expires}.${mac(`link|${owner}|${agent}|${id}|${expires}`)}`;
      return { message: linkMessage(owner, agent, nonce, expires), nonce, expiresAt: new Date(expires).toISOString() };
    },

    /** True once per challenge: the message is ours, not expired, signed by `owner`, and its nonce is burned here. */
    async verifyLink(owner, agent, message, signature) {
      const m = /^Stellar Split agent link\nOwner: (G[A-Z2-7]{55})\nAgent: (G[A-Z2-7]{55})\nNonce: ([\w-]{22})\.(\d{13})\.([\w-]{43})\nExpires: /.exec(String(message));
      if (!m || m[1] !== owner || m[2] !== agent) return false;
      const [, , , id, exp, tag] = m;
      const expires = Number(exp);
      if (!same(tag, mac(`link|${owner}|${agent}|${id}|${expires}`)) || message !== linkMessage(owner, agent, `${id}.${exp}.${tag}`, expires)) return false;
      if (expires < now() || !verifySignedMessage(owner, message, signature)) return false;
      return repo.useNonce(id, new Date(expires).toISOString());
    },

    challenge(address) {
      if (!decodeAddress(address)) return null;
      const expires = now() + challengeTtlMs;
      const id = randomBytes(16).toString('base64url');
      const nonce = `${id}.${expires}.${mac(`challenge|${address}|${id}|${expires}`)}`;
      return { challenge: message(address, nonce, expires), expiresAt: new Date(expires).toISOString() };
    },

    async verify(address, challenge, signature) {
      const m = /^Stellar-Split sign-in\nAddress: (G[A-Z2-7]{55})\nNonce: ([\w-]{22})\.(\d{13})\.([\w-]{43})\nExpires: /.exec(String(challenge));
      if (!m || m[1] !== address) return null;
      const [, , id, exp, tag] = m;
      const expires = Number(exp);
      if (!same(tag, mac(`challenge|${address}|${id}|${expires}`)) || challenge !== message(address, `${id}.${exp}.${tag}`, expires)) return null;
      if (expires < now() || !verifySignedMessage(address, challenge, signature)) return null;
      if (!(await repo.useNonce(id, new Date(expires).toISOString()))) return null; // replay
      const sessionExpires = now() + sessionTtlMs;
      const body = Buffer.from(JSON.stringify({ a: address, e: sessionExpires })).toString('base64url');
      return { token: `${body}.${mac(`session|${body}`)}`, address, expiresAt: new Date(sessionExpires).toISOString() };
    },

    /** @returns {{ kind: 'human' | 'agent', address: string } | null} */
    principal(authorization) {
      const token = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1];
      if (!token) return null;
      const [body, tag, extra] = token.split('.');
      if (body && tag && extra === undefined && same(tag, mac(`session|${body}`))) {
        try {
          const { a, e } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
          if (e >= now() && decodeAddress(a)) return { kind: 'human', address: a };
        } catch {
          return null;
        }
        return null;
      }
      const hash = sha256(token).toString('hex');
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
