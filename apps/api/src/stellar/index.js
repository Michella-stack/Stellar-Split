// Confirms a plain Testnet USDC payment on Horizon before the ledger records it (#42).

import { toStroops } from '../../../../packages/shared/src/index.js';

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

/**
 * @param {{ horizonUrl: string, usdcIssuer: string, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 */
export function createStellar({ horizonUrl, usdcIssuer, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
  const base = horizonUrl.replace(/\/+$/, '');
  let networkChecked = false;

  async function get(path) {
    const res = await fetchImpl(base + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 404) return null;
    if (!res.ok) throw Object.assign(new Error(`Horizon answered ${res.status}`), { code: 'HORIZON_UNAVAILABLE' });
    return res.json();
  }

  return {
    asset: { code: 'USDC', issuer: usdcIssuer },
    explorerTx: (hash) => `https://stellar.expert/explorer/testnet/tx/${hash}`,

    /**
     * Finds one successful USDC payment from `from` to `to` for exactly `amount` in the transaction.
     * @returns {Promise<{ ok: true, ledgerCloseTime: string } | { ok: false, code: string, message: string }>}
     */
    async verifyPayment({ txHash, from, to, amount }) {
      if (!networkChecked) {
        const root = await get('/');
        if (root?.network_passphrase !== TESTNET_PASSPHRASE) {
          return { ok: false, code: 'WRONG_NETWORK', message: 'The configured Horizon is not Stellar Testnet' };
        }
        networkChecked = true;
      }
      const tx = await get(`/transactions/${txHash}`);
      if (!tx) return { ok: false, code: 'PAYMENT_NOT_FOUND', message: 'Transaction not found on Stellar Testnet' };
      if (tx.successful !== true) return { ok: false, code: 'PAYMENT_FAILED', message: 'The transaction failed on chain' };
      const ops = (await get(`/transactions/${txHash}/operations?limit=200`))?._embedded?.records ?? [];
      const want = toStroops(amount);
      const match = ops.find(
        (op) =>
          op.type === 'payment' &&
          (op.from ?? op.source_account) === from &&
          op.to === to &&
          op.asset_code === 'USDC' &&
          op.asset_issuer === usdcIssuer &&
          toStroops(op.amount) === want,
      );
      if (!match) {
        return { ok: false, code: 'PAYMENT_MISMATCH', message: 'No USDC payment with this payer, payee and amount in the transaction' };
      }
      return { ok: true, ledgerCloseTime: tx.created_at };
    },
  };
}
