/**
 * Error from the API (real or mock). `code` is stable and safe to branch on; `message` is for logs.
 * Codes used so far: NETWORK, TIMEOUT, UNAUTHORIZED, NOT_FOUND, VALIDATION, SPLIT_MISMATCH,
 * SECRET_KEY_REJECTED, INVALID_ADDRESS, ALREADY_MEMBER, UNKNOWN.
 */
export class ApiError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ status?: number, details?: unknown }} [extra]
   */
  constructor(code, message, { status = 0, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
