// The only module that imports @stellar/freighter-api. Everything else uses useWallet().
// Returns app objects and WalletError codes, never raw extension responses.

import {
  WatchWalletChanges,
  getAddress,
  getNetwork as freighterGetNetwork,
  isAllowed,
  isConnected,
  requestAccess,
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
