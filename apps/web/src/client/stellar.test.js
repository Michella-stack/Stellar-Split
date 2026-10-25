import { describe, expect, it } from 'vitest';
import { classifySubmitError } from './stellar.js';

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
