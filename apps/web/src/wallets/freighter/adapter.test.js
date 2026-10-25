import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTx, creditor, ISSUER, payer, payment } from './test-helpers.js';

// A fake Freighter extension. Each test sets what it answers.
const ext = vi.hoisted(() => ({
  isConnected: vi.fn(),
  isAllowed: vi.fn(),
  getAddress: vi.fn(),
  requestAccess: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
  signMessage: vi.fn(),
  WatchWalletChanges: vi.fn(),
}));
vi.mock('@stellar/freighter-api', () => ext);

const { assertTestnet, connect, getConnectedAddress, isAvailable, signMessage, signTransaction } = await import('./adapter.js');

const TESTNET = { network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' };
const PUBLIC = { network: 'PUBLIC', networkPassphrase: 'Public Global Stellar Network ; September 2015' };
const rejected = { error: { code: -4, message: 'The user rejected this request.' } };
const intent = { kind: 'payment', signer: payer, destination: creditor, amount: '364.6', assetCode: 'USDC', assetIssuer: ISSUER };

beforeEach(() => {
  vi.resetAllMocks();
  ext.isConnected.mockResolvedValue({ isConnected: true });
  ext.isAllowed.mockResolvedValue({ isAllowed: true });
  ext.getAddress.mockResolvedValue({ address: payer });
  ext.requestAccess.mockResolvedValue({ address: payer });
  ext.getNetwork.mockResolvedValue(TESTNET);
  ext.signTransaction.mockResolvedValue({ signedTxXdr: 'SIGNED', signerAddress: payer });
});

const codeOf = (promise) => promise.then(() => 'NO_ERROR', (e) => e.code);

describe('availability and connect', () => {
  it('reports NOT_INSTALLED when the extension does not answer', async () => {
    ext.isConnected.mockResolvedValue({ isConnected: false });
    expect(await isAvailable()).toBe(false);
    expect(await codeOf(connect())).toBe('NOT_INSTALLED');
  });

  it('treats a throwing extension as not installed', async () => {
    ext.isConnected.mockRejectedValue(new Error('boom'));
    expect(await isAvailable()).toBe(false);
  });

  it('connects and returns a normalized network, not the raw response', async () => {
    expect(await connect()).toEqual({
      address: payer,
      network: { name: 'testnet', passphrase: TESTNET.networkPassphrase, isTestnet: true },
    });
  });

  it('maps a declined access request to USER_REJECTED', async () => {
    ext.requestAccess.mockResolvedValue(rejected);
    expect(await codeOf(connect())).toBe('USER_REJECTED');
  });

  it('reports LOCKED when access returns no address', async () => {
    ext.requestAccess.mockResolvedValue({ address: '' });
    expect(await codeOf(connect())).toBe('LOCKED');
  });

  it('returns no address without prompting when the site is not allowed yet', async () => {
    ext.isAllowed.mockResolvedValue({ isAllowed: false });
    expect(await getConnectedAddress()).toBeNull();
    expect(ext.requestAccess).not.toHaveBeenCalled();
  });
});

describe('network', () => {
  it('refuses anything that is not Testnet', async () => {
    ext.getNetwork.mockResolvedValue(PUBLIC);
    expect(await codeOf(assertTestnet())).toBe('WRONG_NETWORK');
  });
});

describe('signTransaction', () => {
  const xdr = () => buildTx([payment()]);

  it('signs a transaction that matches the intent, pinned to Testnet and the signer', async () => {
    expect(await signTransaction(xdr(), intent)).toEqual({ signedXdr: 'SIGNED', signer: payer });
    expect(ext.signTransaction).toHaveBeenCalledWith(expect.any(String), {
      networkPassphrase: TESTNET.networkPassphrase,
      address: payer,
    });
  });

  it('re-reads the network right before signing and refuses the public network', async () => {
    ext.getNetwork.mockResolvedValue(PUBLIC);
    expect(await codeOf(signTransaction(xdr(), intent))).toBe('WRONG_NETWORK');
    expect(ext.signTransaction).not.toHaveBeenCalled();
  });

  it('refuses when the Freighter account changed since review', async () => {
    ext.getAddress.mockResolvedValue({ address: creditor });
    expect(await codeOf(signTransaction(xdr(), intent))).toBe('ACCOUNT_CHANGED');
    expect(ext.signTransaction).not.toHaveBeenCalled();
  });

  it('refuses a transaction that differs from the reviewed intent', async () => {
    expect(await codeOf(signTransaction(buildTx([payment({ amount: '1000' })]), intent))).toBe('INTENT_MISMATCH');
    expect(ext.signTransaction).not.toHaveBeenCalled();
  });

  it('maps a declined signature to USER_REJECTED', async () => {
    ext.signTransaction.mockResolvedValue(rejected);
    expect(await codeOf(signTransaction(xdr(), intent))).toBe('USER_REJECTED');
  });

  it('reports LOCKED when the address can no longer be read', async () => {
    ext.getAddress.mockResolvedValue({ address: '' });
    expect(await codeOf(signTransaction(xdr(), intent))).toBe('LOCKED');
  });

  it('maps an unknown extension error to UNKNOWN', async () => {
    ext.signTransaction.mockResolvedValue({ error: { code: -1, message: 'internal' } });
    expect(await codeOf(signTransaction(xdr(), intent))).toBe('UNKNOWN');
  });
});

describe('signMessage (SEP-53 sign-in)', () => {
  const message = `Stellar-Split sign-in\nAddress: ${payer}\nNonce: abcdefghijklmnopqrstuv.1792932162000.${'x'.repeat(43)}\nExpires: 2026-10-25T16:00:00.000Z`;
  const intentIn = { kind: 'sign-in', signer: payer };

  it('signs the API sign-in message and returns base64', async () => {
    ext.signMessage.mockResolvedValue({ signedMessage: 'c2lnbmF0dXJl', signerAddress: payer });
    expect(await signMessage(message, intentIn)).toEqual({ signature: 'c2lnbmF0dXJl', signer: payer });
    expect(ext.signMessage).toHaveBeenCalledWith(message, { networkPassphrase: TESTNET.networkPassphrase, address: payer });
  });

  it('converts byte signatures from older Freighter versions to base64', async () => {
    ext.signMessage.mockResolvedValue({ signedMessage: new Uint8Array([1, 2, 3]), signerAddress: payer });
    expect((await signMessage(message, intentIn)).signature).toBe('AQID');
  });

  it('refuses any text that is not a sign-in message for this account', async () => {
    expect(await codeOf(signMessage('Send me all your money', intentIn))).toBe('INTENT_MISMATCH');
    expect(await codeOf(signMessage(message.replace(payer, creditor), intentIn))).toBe('INTENT_MISMATCH');
    expect(ext.signMessage).not.toHaveBeenCalled();
  });

  it('refuses on the wrong network and maps a declined request', async () => {
    ext.getNetwork.mockResolvedValue(PUBLIC);
    expect(await codeOf(signMessage(message, intentIn))).toBe('WRONG_NETWORK');
    ext.getNetwork.mockResolvedValue(TESTNET);
    ext.signMessage.mockResolvedValue(rejected);
    expect(await codeOf(signMessage(message, intentIn))).toBe('USER_REJECTED');
  });
});
