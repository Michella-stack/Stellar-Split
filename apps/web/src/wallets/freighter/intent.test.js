import { describe, expect, it } from 'vitest';
import { Asset, Keypair, Operation } from '@stellar/stellar-sdk';
import { checkIntent } from './intent.js';
import { ISSUER, buildTx, creditor, payer, payment, usdc } from './test-helpers.js';

const memoHash = 'ab'.repeat(32);
const notAfter = new Date(Date.now() + 600_000).toISOString();
const paymentIntent = { kind: 'payment', signer: payer, destination: creditor, amount: '364.60', assetCode: 'USDC', assetIssuer: ISSUER, memoHash, notAfter };
const buildPayment = (ops, options) => buildTx(ops, { memoHash, ...options });
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
    expect(code(() => checkIntent(buildPayment([payment()]), paymentIntent))).toBe('NO_ERROR');
  });

  it.each([
    ['another recipient', [payment({ destination: Keypair.random().publicKey() })]],
    ['another amount', [payment({ amount: '364.61' })]],
    ['another asset', [payment({ asset: new Asset('USDC', Keypair.random().publicKey()) })]],
    ['native XLM', [payment({ asset: Asset.native() })]],
    ['an extra operation', [payment(), payment()]],
    ['a different operation', [Operation.changeTrust({ asset: usdc })]],
  ])('refuses %s', (_, ops) => {
    expect(code(() => checkIntent(buildPayment(ops), paymentIntent))).toBe('INTENT_MISMATCH');
  });

  it('refuses a transaction from another account', () => {
    expect(code(() => checkIntent(buildPayment([payment()], { source: Keypair.random().publicKey() }), paymentIntent))).toBe('INTENT_MISMATCH');
  });

  it('refuses a transaction without an expiry or already expired', () => {
    expect(code(() => checkIntent(buildPayment([payment()], { timeout: 0 }), paymentIntent))).toBe('INTENT_MISMATCH');
    const later = new Date(Date.now() + 3600_000);
    expect(code(() => checkIntent(buildPayment([payment()]), paymentIntent, { now: later }))).toBe('INTENT_MISMATCH');
  });
});

describe('checkIntent: settlement intent memo and expiry', () => {
  const withMemo = paymentIntent;

  it('accepts the payment that carries the reserved memo and expires in time', () => {
    expect(code(() => checkIntent(buildTx([payment()], { memoHash }), withMemo))).toBe('NO_ERROR');
  });

  it('refuses a missing or different memo', () => {
    expect(code(() => checkIntent(buildTx([payment()]), withMemo))).toBe('INTENT_MISMATCH');
    expect(code(() => checkIntent(buildTx([payment()], { memoHash: 'cd'.repeat(32) }), withMemo))).toBe('INTENT_MISMATCH');
  });

  it('refuses an intent without the reserved memo or expiry, or with an unparsable expiry', () => {
    const tx = buildTx([payment()], { memoHash });
    expect(code(() => checkIntent(tx, { ...paymentIntent, memoHash: undefined }))).toBe('INTENT_MISMATCH');
    expect(code(() => checkIntent(tx, { ...paymentIntent, notAfter: undefined }))).toBe('INTENT_MISMATCH');
    expect(code(() => checkIntent(tx, { ...paymentIntent, notAfter: 'not a date' }))).toBe('INTENT_MISMATCH');
  });

  it('refuses a payment that would stay valid after the reservation expires', () => {
    const soon = { ...withMemo, notAfter: new Date(Date.now() + 60_000).toISOString() };
    expect(code(() => checkIntent(buildTx([payment()], { memoHash, timeout: 300 }), soon))).toBe('INTENT_MISMATCH');
  });
});

describe('checkIntent: trustline', () => {
  it('accepts a USDC trustline and refuses another asset', () => {
    const intent = { kind: 'trustline', signer: payer, assetCode: 'USDC', assetIssuer: ISSUER };
    expect(code(() => checkIntent(buildTx([Operation.changeTrust({ asset: usdc })]), intent))).toBe('NO_ERROR');
    const other = Operation.changeTrust({ asset: new Asset('USDC', Keypair.random().publicKey()) });
    expect(code(() => checkIntent(buildTx([other]), intent))).toBe('INTENT_MISMATCH');
  });

  it('refuses a payment presented as a trustline', () => {
    const intent = { kind: 'trustline', signer: payer, assetCode: 'USDC', assetIssuer: ISSUER };
    expect(code(() => checkIntent(buildTx([payment()]), intent))).toBe('INTENT_MISMATCH');
  });
});
