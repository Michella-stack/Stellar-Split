// Amounts. Decimal strings at the edges (HTTP, UI), integer stroops (BigInt) for all arithmetic.
// USDC and XLM on Stellar both use 7 decimal places. Never use JavaScript numbers for money.

export const DECIMALS = 7;
export const STROOPS_PER_UNIT = 10_000_000n;

const AMOUNT = /^(\d+)(?:\.(\d+))?$/;

/**
 * Stable error codes for amount input. The UI maps them to messages; the API returns them as-is.
 * @typedef {'INVALID_FORMAT' | 'TOO_MANY_DECIMALS' | 'NOT_POSITIVE' | 'EXCEEDS_LIMIT'} AmountErrorCode
 */

export class AmountError extends Error {
  /** @param {AmountErrorCode} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'AmountError';
    this.code = code;
  }
}

/**
 * Parses a non-negative decimal string into stroops. Accepts "12", "12.5", "0.0000001".
 * Rejects signs, exponents, commas, spaces, a bare "." and more than 7 decimals.
 * @param {string} value
 * @returns {bigint}
 */
export function toStroops(value) {
  if (typeof value !== 'string') throw new AmountError('INVALID_FORMAT', 'Amount must be a string');
  const match = AMOUNT.exec(value);
  if (!match) throw new AmountError('INVALID_FORMAT', `Not a decimal amount: "${value}"`);
  const [, whole, fraction = ''] = match;
  if (fraction.length > DECIMALS) {
    throw new AmountError('TOO_MANY_DECIMALS', `At most ${DECIMALS} decimal places`);
  }
  return BigInt(whole) * STROOPS_PER_UNIT + BigInt(fraction.padEnd(DECIMALS, '0'));
}

/**
 * Formats stroops as a decimal string. Negative values keep their sign.
 * @param {bigint} stroops
 * @param {{ minDecimals?: number }} [options] trailing zeros are trimmed down to minDecimals (default 7, no trimming)
 * @returns {string} e.g. "364.6000000", or "364.60" with minDecimals 2
 */
export function fromStroops(stroops, { minDecimals = DECIMALS } = {}) {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOPS_PER_UNIT;
  let fraction = (abs % STROOPS_PER_UNIT).toString().padStart(DECIMALS, '0');
  while (fraction.length > minDecimals && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  const text = fraction.length > 0 ? `${whole}.${fraction}` : `${whole}`;
  return negative ? `-${text}` : text;
}

/**
 * Validates a payment or expense amount entered by a person.
 * @param {string} value decimal string
 * @param {{ max?: bigint }} [options] max in stroops, e.g. the payer's balance or the open debt
 * @returns {{ ok: true, stroops: bigint } | { ok: false, code: AmountErrorCode }}
 */
export function validateAmount(value, { max } = {}) {
  let stroops;
  try {
    stroops = toStroops(value);
  } catch (error) {
    if (error instanceof AmountError) return { ok: false, code: error.code };
    throw error;
  }
  if (stroops <= 0n) return { ok: false, code: 'NOT_POSITIVE' };
  if (max !== undefined && stroops > max) return { ok: false, code: 'EXCEEDS_LIMIT' };
  return { ok: true, stroops };
}

/**
 * Sum of stroop values.
 * @param {Iterable<bigint>} values
 */
export function sum(values) {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}
