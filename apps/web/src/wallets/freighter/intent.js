// Checks that a transaction matches what the person reviewed, before Freighter is asked to sign it.

import { TransactionBuilder } from '@stellar/stellar-sdk';
import { toStroops } from '@shared/money.js';
import { NETWORK_PASSPHRASE } from '../../config/env.js';
import { WalletError } from './errors.js';

/**
 * What the person agreed to on the review screen.
 * @typedef {{ kind: 'sign-in', signer: string }
 *   | { kind: 'payment', signer: string, destination: string, amount: string, assetCode: string, assetIssuer: string }
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

  if (intent.kind === 'sign-in') {
    // SEP-10 style challenge: only manage_data operations for the signer, never anything that moves money.
    if (ops.length === 0 || !ops.every((op) => op.type === 'manageData')) throw mismatch('a sign-in must only contain data entries');
    if (opSource(ops[0]) !== intent.signer) throw mismatch('the sign-in is for another account');
    return tx;
  }

  if (tx.source !== intent.signer) throw mismatch('paid from another account');
  if (ops.length !== 1) throw mismatch('expected exactly one operation');
  const [op] = ops;
  if (opSource(op) !== intent.signer) throw mismatch('operation runs for another account');

  if (intent.kind === 'payment') {
    if (op.type !== 'payment') throw mismatch('not a payment');
    if (op.destination !== intent.destination) throw mismatch('different recipient');
    if (op.asset.getCode() !== intent.assetCode || op.asset.getIssuer() !== intent.assetIssuer) throw mismatch('different asset');
    if (toStroops(op.amount) !== toStroops(intent.amount)) throw mismatch('different amount');
    return tx;
  }

  if (intent.kind === 'trustline') {
    if (op.type !== 'changeTrust') throw mismatch('not a trustline');
    if (op.line.getCode?.() !== intent.assetCode || op.line.getIssuer?.() !== intent.assetIssuer) throw mismatch('different asset');
    return tx;
  }

  throw mismatch('unknown intent');
}
