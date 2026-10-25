// Confirms a plain Testnet payment (USDC, or EURC when an issuer is configured) on Horizon before the ledger records it (#42, #98).

import { toStroops } from '../../../../packages/shared/src/index.js';

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

/**
 * @param {{ horizonUrl: string, usdcIssuer: string, eurcIssuer?: string | null, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 */
export function createStellar({ horizonUrl, usdcIssuer, eurcIssuer = null, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
  const base = horizonUrl.replace(/\/+$/, '');
  let networkChecked = false;
  const assets = { USDC: { code: 'USDC', issuer: usdcIssuer }, ...(eurcIssuer ? { EURC: { code: 'EURC', issuer: eurcIssuer } } : {}) };

  async function get(path) {
    const res = await fetchImpl(base + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) }).catch((err) => {
      throw err?.name === 'TimeoutError' ? err : Object.assign(new Error('Horizon is unreachable'), { code: 'HORIZON_UNAVAILABLE', cause: err });
    });
    if (res.status === 404) return null;
    if (!res.ok) throw Object.assign(new Error(`Horizon answered ${res.status}`), { code: 'HORIZON_UNAVAILABLE' });
    return res.json();
  }

  return {
    asset: assets.USDC,
    /** The settlement asset for a code such as 'USDC' or 'EURC', or null when it is not configured. */
    assetFor: (code) => assets[code] ?? null,
    supportedAssets: () => Object.keys(assets),
    explorerTx: (hash) => `https://stellar.expert/explorer/testnet/tx/${hash}`,

    /**
     * Finds one successful payment in `asset` (USDC unless the group settles in another asset) from `from` to `to` for exactly `amount` in the transaction.
     * The transaction must carry `memoHash` as a MEMO_HASH and end its time bounds by `notAfter`: that proves it
     * was built for this intent, after the reservation, and could not reach the chain once the intent expired.
     * @returns {Promise<{ ok: true, ledgerCloseTime: string } | { ok: false, code: string, message: string }>}
     */
    async verifyPayment({ txHash, from, to, amount, memoHash, notAfter, asset = assets.USDC }) {
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
      const memo = tx.memo_type === 'hash' && tx.memo ? Buffer.from(tx.memo, 'base64').toString('hex') : null;
      if (memo !== memoHash) {
        return { ok: false, code: 'INTENT_MISMATCH', message: 'The transaction memo does not match this settlement intent' };
      }
      const maxTime = Number(tx.preconditions?.timebounds?.max_time ?? (tx.valid_before ? Date.parse(tx.valid_before) / 1000 : 0));
      if (!(maxTime > 0) || maxTime * 1000 > Date.parse(notAfter)) {
        return { ok: false, code: 'TIMEBOUNDS_TOO_LONG', message: 'The transaction must expire no later than the settlement intent' };
      }
      const ops = (await get(`/transactions/${txHash}/operations?limit=200`))?._embedded?.records ?? [];
      const want = toStroops(amount);
      const match = ops.find(
        (op) =>
          op.type === 'payment' &&
          (op.from ?? op.source_account) === from &&
          op.to === to &&
          op.asset_code === asset.code &&
          op.asset_issuer === asset.issuer &&
          toStroops(op.amount) === want,
      );
      if (!match) {
        return { ok: false, code: 'PAYMENT_MISMATCH', message: `No ${asset.code} payment with this payer, payee and amount in the transaction` };
      }
      return { ok: true, ledgerCloseTime: tx.created_at };
    },
  };
}
