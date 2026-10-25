// All Horizon (Stellar Testnet) access lives here so the settlement path can later move to the contract.

import { Horizon } from '@stellar/stellar-sdk';
import { CONFIG, FRIENDBOT_URL } from '../config/env.js';

let server = /** @type {Horizon.Server | null} */ (null);
function horizon() {
  if (!CONFIG.ok) throw new Error('Configuration is not valid for Testnet');
  server ??= new Horizon.Server(CONFIG.config.horizonUrl);
  return server;
}

/**
 * @typedef {{ funded: false } | { funded: true, xlm: string, usdc: string | null, usdcLimit: string | null }} AccountBalances
 *   usdc is null when the account has no USDC trustline.
 */

/**
 * Reads XLM and USDC balances. An account that does not exist yet on Testnet returns { funded: false }.
 * @param {string} address
 * @returns {Promise<AccountBalances>}
 */
export async function loadBalances(address) {
  let account;
  try {
    account = await horizon().loadAccount(address);
  } catch (error) {
    if (error?.response?.status === 404 || error?.name === 'NotFoundError') return { funded: false };
    throw error;
  }
  const xlm = account.balances.find((b) => b.asset_type === 'native');
  const usdc = account.balances.find(
    (b) => b.asset_type !== 'native' && b.asset_code === 'USDC' && b.asset_issuer === CONFIG.config.usdcIssuer,
  );
  return { funded: true, xlm: xlm?.balance ?? '0', usdc: usdc?.balance ?? null, usdcLimit: usdc?.limit ?? null };
}

/**
 * Funds a new Testnet account with test XLM from Friendbot.
 * @param {string} address
 */
export async function fundWithFriendbot(address) {
  const response = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(address)}`);
  if (!response.ok && response.status !== 400) throw new Error(`Friendbot returned ${response.status}`);
  // 400 means the account already exists, which is fine.
}
