// Builds unsigned Testnet transactions for adapter and intent tests.
import { Account, Asset, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { NETWORK_PASSPHRASE } from '../../config/env.js';

export const ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
export const payer = Keypair.random().publicKey();
export const creditor = Keypair.random().publicKey();

/** @param {import('@stellar/stellar-sdk').xdr.Operation[]} ops */
export function buildTx(ops, { source = payer, passphrase = NETWORK_PASSPHRASE, timeout = 300 } = {}) {
  const builder = new TransactionBuilder(new Account(source, '1'), { fee: '100', networkPassphrase: passphrase });
  for (const op of ops) builder.addOperation(op);
  return builder.setTimeout(timeout).build().toXDR();
}

export const usdc = new Asset('USDC', ISSUER);
export const payment = (overrides = {}) =>
  Operation.payment({ destination: creditor, asset: usdc, amount: '364.6', ...overrides });
