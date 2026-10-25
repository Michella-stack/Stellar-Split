// Runtime configuration from VITE_ variables. Fails closed: anything that is not Stellar Testnet is refused.

import { Networks, StrKey } from '@stellar/stellar-sdk';

export const NETWORK = 'testnet';
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const EXPLORER_TX_URL = 'https://stellar.expert/explorer/testnet/tx/';
export const FREIGHTER_INSTALL_URL = 'https://www.freighter.app/';
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const USDC_FAUCET_URL = 'https://faucet.circle.com/';

const TESTNET_HORIZONS = ['https://horizon-testnet.stellar.org'];

/**
 * Reads and checks the environment.
 * @param {Record<string, string | undefined>} env usually import.meta.env
 * @returns {{ ok: true, config: { horizonUrl: string, usdcIssuer: string, apiUrl: string, useMocks: boolean } }
 *   | { ok: false, problems: string[] }}
 */
export function readConfig(env) {
  const problems = [];
  if (env.VITE_NETWORK !== 'testnet') problems.push('VITE_NETWORK must be "testnet". This app never runs on the public network.');
  const horizonUrl = (env.VITE_HORIZON_URL ?? '').replace(/\/$/, '');
  if (!TESTNET_HORIZONS.includes(horizonUrl) && !/^http:\/\/localhost(:\d+)?$/.test(horizonUrl)) {
    problems.push('VITE_HORIZON_URL must be the Stellar Testnet Horizon (https://horizon-testnet.stellar.org) or a local one.');
  }
  const usdcIssuer = env.VITE_USDC_ISSUER ?? '';
  if (!StrKey.isValidEd25519PublicKey(usdcIssuer)) problems.push('VITE_USDC_ISSUER must be the Testnet USDC issuer address (G...).');
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    config: { horizonUrl, usdcIssuer, apiUrl: env.VITE_API_URL ?? '', useMocks: env.VITE_USE_MOCKS === 'true' },
  };
}

export const CONFIG = readConfig(import.meta.env);
