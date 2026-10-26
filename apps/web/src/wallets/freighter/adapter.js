// The only module that imports @stellar/freighter-api. Everything else uses useWallet().
// Returns app objects and WalletError codes, never raw extension responses.

import {
  WatchWalletChanges,
  getAddress,
  getNetwork as freighterGetNetwork,
  isAllowed,
  isConnected,
  requestAccess,
  signMessage as freighterSignMessage,
  signTransaction as freighterSign,
} from '@stellar/freighter-api';
import { NETWORK_PASSPHRASE } from '../../config/env.js';
import { WalletError, fromFreighterError } from './errors.js';

/**
 * @typedef {{ name: 'testnet' | 'public' | 'futurenet' | 'other', passphrase: string, isTestnet: boolean }} WalletNetwork
 */

/** True when the Freighter extension is installed and answering. */
export async function isAvailable() {
  try {
    const result = await isConnected();
    return !result.error && result.isConnected === true;
  } catch {
    return false;
  }
}

/** @param {string} passphrase @returns {WalletNetwork} */
function normalizeNetwork(passphrase) {
  const isTestnet = passphrase === NETWORK_PASSPHRASE;
  const name = isTestnet
    ? 'testnet'
    : passphrase === 'Public Global Stellar Network ; September 2015'
      ? 'public'
      : passphrase === 'Test SDF Future Network ; October 2022'
        ? 'futurenet'
        : 'other';
  return { name, passphrase, isTestnet };
}

/** @returns {Promise<WalletNetwork>} */
export async function getNetwork() {
  if (!(await isAvailable())) throw new WalletError('NOT_INSTALLED', 'Freighter is not installed');
  const result = await freighterGetNetwork();
  if (result.error) throw fromFreighterError(result.error);
  return normalizeNetwork(result.networkPassphrase);
}

/** Throws WRONG_NETWORK unless Freighter is on Stellar Testnet. */
export async function assertTestnet() {
  const network = await getNetwork();
  if (!network.isTestnet) throw new WalletError('WRONG_NETWORK', `Freighter is on ${network.name}, not Testnet`);
  return network;
}

/**
 * The address this site may already read, without opening a prompt. Null when not yet allowed.
 * @returns {Promise<string | null>}
 */
export async function getConnectedAddress() {
  if (!(await isAvailable())) return null;
  const allowed = await isAllowed();
  if (allowed.error || !allowed.isAllowed) return null;
  const result = await getAddress();
  if (result.error || !result.address) return null;
  return result.address;
}

/**
 * Asks Freighter for access and returns the account and network. Opens the Freighter popup.
 * @returns {Promise<{ address: string, network: WalletNetwork }>}
 */
export async function connect() {
  if (!(await isAvailable())) throw new WalletError('NOT_INSTALLED', 'Freighter is not installed');
  const access = await requestAccess();
  if (access.error) throw fromFreighterError(access.error);
  if (!access.address) throw new WalletError('LOCKED', 'Freighter did not return an address; it may be locked');
  const network = await getNetwork();
  return { address: access.address, network };
}

/**
 * Signs a transaction after re-reading the account and network and checking it matches the reviewed intent.
 * @param {string} xdr unsigned transaction envelope (base64)
 * @param {import('./intent.js').SigningIntent} intent
 * @returns {Promise<{ signedXdr: string, signer: string }>}
 */
export async function signTransaction(xdr, intent) {
  // Re-read state immediately before the signature; never trust what was true at review time.
  await assertTestnet();
  const current = await getConnectedAddress();
  if (!current) throw new WalletError('LOCKED', 'Freighter is locked or this site lost access');
  if (current !== intent.signer) throw new WalletError('ACCOUNT_CHANGED', 'The Freighter account changed since you reviewed this');
  // Loaded on first signature so the Stellar SDK is not part of the first page.
  const { checkIntent } = await import('./intent.js');
  checkIntent(xdr, intent);

  const result = await freighterSign(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address: intent.signer });
  if (result.error) throw fromFreighterError(result.error);
  if (result.signerAddress && result.signerAddress !== intent.signer) {
    throw new WalletError('ACCOUNT_CHANGED', 'Freighter signed with a different account');
  }
  return { signedXdr: result.signedTxXdr, signer: intent.signer };
}

/** @typedef {{ kind: 'sign-in', signer: string } | { kind: 'agent-link', signer: string, agent: string }} MessageIntent */

// The API's sign-in message (SEP-53). Anything else is refused, so a page cannot get an arbitrary text signed.
const SIGN_IN_MESSAGE = /^Stellar-Split sign-in\nAddress: (G[A-Z2-7]{55})\nNonce: [\w.-]{20,120}\nExpires: \d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

// The API's agent-link message (docs/adr/0005): the owner approves one agent address.
const AGENT_LINK_MESSAGE = /^Stellar Split agent link\nOwner: (G[A-Z2-7]{55})\nAgent: (G[A-Z2-7]{55})\nNonce: [\w.-]{16,200}\nExpires: \d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

/**
 * Signs the API's sign-in message (SEP-53 signed message) after re-reading the account and network.
 * @param {string} message challenge text from the API
 * @param {MessageIntent} intent
 *   agent-link: the message must name this signer as owner and this agent, or nothing is signed
 * @returns {Promise<{ signature: string, signer: string }>} base64 ed25519 signature
 */
export async function signMessage(message, intent) {
  await assertTestnet();
  const current = await getConnectedAddress();
  if (!current) throw new WalletError('LOCKED', 'Freighter is locked or this site lost access');
  if (current !== intent.signer) throw new WalletError('ACCOUNT_CHANGED', 'The Freighter account changed');
  let matches = false;
  if (intent.kind === 'sign-in') {
    matches = SIGN_IN_MESSAGE.exec(message)?.[1] === intent.signer;
  } else if (intent.kind === 'agent-link') {
    const [, owner, agent] = AGENT_LINK_MESSAGE.exec(message) ?? [];
    matches = owner === intent.signer && agent === intent.agent && agent !== owner;
  }
  if (!matches) throw new WalletError('INTENT_MISMATCH', 'This is not a Stellar-Split message for your account');

  const result = await freighterSignMessage(message, { networkPassphrase: NETWORK_PASSPHRASE, address: intent.signer });
  if (result.error) throw fromFreighterError(result.error);
  if (result.signerAddress && result.signerAddress !== intent.signer) {
    throw new WalletError('ACCOUNT_CHANGED', 'Freighter signed with a different account');
  }
  const signature = toBase64(result.signedMessage);
  if (!signature) throw new WalletError('UNKNOWN', 'Freighter returned no signature');
  return { signature, signer: intent.signer };
}

/**
 * Freighter returns a base64 string (newer extensions) or bytes (older ones).
 * @param {string | Uint8Array | null | undefined} value
 */
function toBase64(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return btoa(String.fromCharCode(...value));
}

/**
 * Calls back when the Freighter account or network changes. Returns a stop function.
 * @param {(state: { address: string | null, network: WalletNetwork | null }) => void} onChange
 * @param {number} [intervalMs]
 */
export function watch(onChange, intervalMs = 2000) {
  const watcher = new WatchWalletChanges(intervalMs);
  watcher.watch(({ address, networkPassphrase, error }) => {
    if (error) return;
    onChange({ address: address || null, network: networkPassphrase ? normalizeNetwork(networkPassphrase) : null });
  });
  return () => watcher.stop();
}
