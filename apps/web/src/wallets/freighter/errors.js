/**
 * Stable wallet error codes. Components branch on `code`, never on Freighter's own messages.
 * @typedef {'NOT_INSTALLED' | 'LOCKED' | 'USER_REJECTED' | 'WRONG_NETWORK' | 'ACCOUNT_CHANGED' | 'INTENT_MISMATCH' | 'UNKNOWN'} WalletErrorCode
 */

export class WalletError extends Error {
  /** @param {WalletErrorCode} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
  }
}

// Freighter returns { code: -4, message: 'The user rejected this request.' } when the person declines.
const DECLINED = -4;

/**
 * Maps a Freighter `error` object to a WalletError.
 * @param {{ code?: number, message?: string } | undefined} error
 */
export function fromFreighterError(error) {
  const message = error?.message ?? 'Unknown Freighter error';
  if (error?.code === DECLINED || /reject|declin/i.test(message)) return new WalletError('USER_REJECTED', message);
  if (/lock/i.test(message)) return new WalletError('LOCKED', message);
  return new WalletError('UNKNOWN', message);
}
