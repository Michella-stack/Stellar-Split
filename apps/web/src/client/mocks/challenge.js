// A local stand-in for the API's SEP-10 style challenge, so mock mode still asks Freighter for a real
// signature. The transaction only holds a data entry, expires in 5 minutes and is never submitted.

import { Account, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { NETWORK_PASSPHRASE } from '../../config/env.js';

const serverKey = Keypair.random();

/** @param {string} address */
export function buildChallenge(address) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(36))));
  const tx = new TransactionBuilder(new Account(serverKey.publicKey(), '-1'), { fee: '100', networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.manageData({ name: 'stellar-split auth', value: nonce, source: address }))
    .setTimeout(300)
    .build();
  tx.sign(serverKey);
  return tx.toXDR();
}

/**
 * True when the challenge carries a valid signature from `address` and has not expired.
 * @param {string} signedXdr
 * @param {string} address
 */
export function verifyChallenge(signedXdr, address) {
  let tx;
  try {
    tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  } catch {
    return false;
  }
  if (Number(tx.timeBounds?.maxTime ?? 0) * 1000 < Date.now()) return false;
  const client = Keypair.fromPublicKey(address);
  const hash = tx.hash();
  // stellar-sdk 17 exposes `signature` as a property (earlier versions used a method).
  return tx.signatures.some((sig) => client.verify(hash, sig.signature));
}
