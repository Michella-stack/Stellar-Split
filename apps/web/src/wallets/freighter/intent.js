// Checks that a transaction matches what the person reviewed, before Freighter is asked to sign it.

import { TransactionBuilder } from '@stellar/stellar-sdk';
import { toStroops } from '@shared/money.js';
import { NETWORK_PASSPHRASE } from '../../config/env.js';
import { WalletError } from './errors.js';

/**
 * What the person agreed to on the review screen.
 * @typedef {{ kind: 'payment', signer: string, destination: string, amount: string, assetCode: string, assetIssuer: string,
 *     memoHash?: string, notAfter?: string }
 *   | { kind: 'trustline', signer: string, assetCode: string, assetIssuer: string }} SigningIntent
 */

const mismatch = (why) => new WalletError('INTENT_MISMATCH', `Transaction does not match what you reviewed: ${why}`);

/**
 * @param {string} xdr unsigned transaction envelope
 * @param {SigningIntent} intent
 * @param {{ now?: Date }} [options]
 */
export function checkIntent(xdr, intent, { now = new Date() } = {}) {
  let tx;
  try {
    tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
  } catch {
    throw mismatch('not a valid Testnet transaction');
  }
  // An unsigned envelope does not record its network: the passphrase only enters the signature hash.
  // The Testnet guarantee therefore comes from the adapter, which checks Freighter is on Testnet and
  // passes the Testnet passphrase to every signature.
  if ('innerTransaction' in tx) throw mismatch('fee-bump transactions are not signed here');

  const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
  if (maxTime === 0) throw mismatch('no expiry time');
  if (maxTime * 1000 < now.getTime()) throw mismatch('expired');

  const ops = tx.operations;
  const opSource = (op) => op.source ?? tx.source;

  if (tx.source !== intent.signer) throw mismatch('paid from another account');
  if (ops.length !== 1) throw mismatch('expected exactly one operation');
  const [op] = ops;
  if (opSource(op) !== intent.signer) throw mismatch('operation runs for another account');

  if (intent.kind === 'payment') {
    if (op.type !== 'payment') throw mismatch('not a payment');
    if (op.destination !== intent.destination) throw mismatch('different recipient');
    if (op.asset.getCode() !== intent.assetCode || op.asset.getIssuer() !== intent.assetIssuer) throw mismatch('different asset');
    if (toStroops(op.amount) !== toStroops(intent.amount)) throw mismatch('different amount');
    if (intent.memoHash !== undefined) {
      const memo = tx.memo;
      const hex = memo?.type === 'hash' && memo.value ? toHex(memo.value) : null;
      if (hex !== intent.memoHash.toLowerCase()) throw mismatch('the payment reference (memo) is not the reserved one');
    }
    if (intent.notAfter !== undefined && maxTime * 1000 > Date.parse(intent.notAfter)) throw mismatch('it stays valid after the reservation expires');
    return tx;
  }

  if (intent.kind === 'trustline') {
    if (op.type !== 'changeTrust') throw mismatch('not a trustline');
    if (op.line.getCode?.() !== intent.assetCode || op.line.getIssuer?.() !== intent.assetIssuer) throw mismatch('different asset');
    return tx;
  }

  throw mismatch('unknown intent');
}

/** @param {Uint8Array} bytes */
function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
