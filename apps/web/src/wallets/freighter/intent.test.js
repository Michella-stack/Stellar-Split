import { describe, expect, it } from 'vitest';
import { Asset, Keypair, Operation } from '@stellar/stellar-sdk';
import { checkIntent } from './intent.js';
import { ISSUER, buildTx, creditor, payer, payment, usdc } from './test-helpers.js';

const paymentIntent = { kind: 'payment', signer: payer, destination: creditor, amount: '364.60', assetCode: 'USDC', assetIssuer: ISSUER };
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return 'NO_ERROR';
};

describe('checkIntent: payment', () => {
  it('accepts the payment that was reviewed', () => {
    expect(code(() => checkIntent(buildTx([payment()]), paymentIntent))).toBe('NO_ERROR');
  });

  it.each([
    ['another recipient', [payment({ destination: Keypair.random().publicKey() })]],
    ['another amount', [payment({ amount: '364.61' })]],
    ['another asset', [payment({ asset: new Asset('USDC', Keypair.random().publicKey()) })]],
    ['native XLM', [payment({ asset: Asset.native() })]],
    ['an extra operation', [payment(), payment()]],
    ['a different operation', [Operation.changeTrust({ asset: usdc })]],
  ])('refuses %s', (_, ops) => {
    expect(code(() => checkIntent(buildTx(ops), paymentIntent))).toBe('INTENT_MISMATCH');
  });

  it('refuses a transaction from another account', () => {
    expect(code(() => checkIntent(buildTx([payment()], { source: Keypair.random().publicKey() }), paymentIntent))).toBe('INTENT_MISMATCH');
  });

  it('refuses a transaction without an expiry or already expired', () => {
    expect(code(() => checkIntent(buildTx([payment()], { timeout: 0 }), paymentIntent))).toBe('INTENT_MISMATCH');
    const later = new Date(Date.now() + 3600_000);
    expect(code(() => checkIntent(buildTx([payment()]), paymentIntent, { now: later }))).toBe('INTENT_MISMATCH');
  });
});

describe('checkIntent: sign-in and trustline', () => {
  it('accepts a challenge made only of data entries for the signer', () => {
    const xdr = buildTx([Operation.manageData({ name: 'stellar-split auth', value: 'nonce', source: payer })]);
    expect(code(() => checkIntent(xdr, { kind: 'sign-in', signer: payer }))).toBe('NO_ERROR');
  });

  it('refuses a "sign-in" that moves money', () => {
    const xdr = buildTx([Operation.manageData({ name: 'auth', value: 'x', source: payer }), payment()]);
    expect(code(() => checkIntent(xdr, { kind: 'sign-in', signer: payer }))).toBe('INTENT_MISMATCH');
  });

  it('accepts a USDC trustline and refuses another asset', () => {
    const intent = { kind: 'trustline', signer: payer, assetCode: 'USDC', assetIssuer: ISSUER };
    expect(code(() => checkIntent(buildTx([Operation.changeTrust({ asset: usdc })]), intent))).toBe('NO_ERROR');
    const other = Operation.changeTrust({ asset: new Asset('USDC', Keypair.random().publicKey()) });
    expect(code(() => checkIntent(buildTx([other]), intent))).toBe('INTENT_MISMATCH');
  });
});
