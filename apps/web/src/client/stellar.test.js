import { describe, expect, it } from 'vitest';
import { Asset } from '@stellar/stellar-sdk';
import { buildUsdcPayment, classifySubmitError, sameSettlementAsset } from './stellar.js';

const horizonError = (status, transaction, operations = []) => ({
  response: { status, data: { extras: { result_codes: { transaction, operations } } } },
});

describe('classifySubmitError', () => {
  it.each([
    [{ message: 'fetch failed' }, 'NETWORK'],
    [{ response: { status: 504, data: {} } }, 'TIMEOUT'],
    [horizonError(400, 'tx_failed', ['op_underfunded']), 'INSUFFICIENT_BALANCE'],
    [horizonError(400, 'tx_failed', ['op_src_no_trust']), 'NO_TRUSTLINE'],
    [horizonError(400, 'tx_failed', ['op_no_trust']), 'RECIPIENT_NOT_READY'],
    [horizonError(400, 'tx_failed', ['op_no_destination']), 'RECIPIENT_NOT_READY'],
    [horizonError(400, 'tx_too_late'), 'EXPIRED'],
    [horizonError(400, 'tx_insufficient_balance'), 'LOW_XLM'],
    [horizonError(400, 'tx_bad_seq'), 'REJECTED_BY_NETWORK'],
    [{ response: { status: 500, data: {} } }, 'UNKNOWN'],
  ])('%#: maps to %s', (error, code) => {
    const result = classifySubmitError(error, 'abc');
    expect(result.code).toBe(code);
    expect(result.txHash).toBe('abc');
  });
});

describe('buildUsdcPayment', () => {
  const base = { from: 'G'.padEnd(56, 'A'), to: 'G'.padEnd(56, 'B'), amount: '1.00', memoHash: 'ab'.repeat(32) };

  it('refuses an unparsable reservation expiry', async () => {
    await expect(buildUsdcPayment({ ...base, notAfter: 'soon' })).rejects.toMatchObject({ code: 'UNKNOWN' });
    await expect(buildUsdcPayment({ ...base, notAfter: undefined })).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('refuses a reservation that has already expired', async () => {
    await expect(buildUsdcPayment({ ...base, notAfter: new Date(Date.now() - 1000).toISOString() })).rejects.toMatchObject({ code: 'EXPIRED' });
  });
});

describe('sameSettlementAsset', () => {
  const issuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const other = 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO';
  const eurc = new Asset('EURC', other);

  it('accepts the same code and issuer', () => {
    expect(sameSettlementAsset({ code: 'EURC', issuer: other }, eurc)).toBe(true);
  });

  it('refuses another code or another issuer, so nothing is signed in the wrong asset', () => {
    expect(sameSettlementAsset({ code: 'USDC', issuer }, eurc)).toBe(false);
    expect(sameSettlementAsset({ code: 'EURC', issuer }, eurc)).toBe(false);
  });

  it('compares only what the API states: the sample-data API names no issuer', () => {
    expect(sameSettlementAsset({ code: 'EURC', issuer: null }, eurc)).toBe(true);
    expect(sameSettlementAsset({ code: 'USDC', issuer: null }, eurc)).toBe(false);
    expect(sameSettlementAsset(undefined, eurc)).toBe(true);
  });
});
