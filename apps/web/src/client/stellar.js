// All Horizon (Stellar Testnet) access lives here so the settlement path can later move to the contract.

import { Asset, BASE_FEE, Horizon, Memo, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { toStroops } from '@shared/money.js';
import { CONFIG, FRIENDBOT_URL, NETWORK_PASSPHRASE } from '../config/env.js';
import { DEMO } from '../lib/demoMode.js';

const TX_TIMEOUT_SECONDS = 180;

let server = /** @type {Horizon.Server | null} */ (null);
function horizon() {
  if (!CONFIG.ok) throw new Error('Configuration is not valid for Testnet');
  server ??= new Horizon.Server(CONFIG.config.horizonUrl);
  return server;
}

/** The Testnet USDC asset from configuration. */
export function usdcAsset() {
  return new Asset('USDC', CONFIG.config.usdcIssuer);
}

/**
 * Stable settlement error codes shown on the payment problem screen.
 * @typedef {'NOT_FUNDED' | 'NO_TRUSTLINE' | 'INSUFFICIENT_BALANCE' | 'LOW_XLM' | 'RECIPIENT_NOT_READY' | 'SAME_ACCOUNT'
 *   | 'NETWORK' | 'TIMEOUT' | 'EXPIRED' | 'REJECTED_BY_NETWORK' | 'UNKNOWN'} SettlementErrorCode
 */
export class SettlementError extends Error {
  /** @param {SettlementErrorCode} code @param {string} message @param {{ txHash?: string }} [extra] */
  constructor(code, message, { txHash } = {}) {
    super(message);
    this.name = 'SettlementError';
    this.code = code;
    this.txHash = txHash;
  }
}

/**
 * @typedef {{ funded: false } | { funded: true, xlm: string, usdc: string | null, usdcLimit: string | null, subentries: number }} AccountBalances
 *   usdc is null when the account has no USDC trustline.
 */

/**
 * Reads XLM and USDC balances. An account that does not exist yet on Testnet returns { funded: false }.
 * @param {string} address
 * @returns {Promise<AccountBalances>}
 */
export async function loadBalances(address) {
  // Demo mode never contacts Stellar: the sample person holds sample money.
  if (DEMO) return { funded: true, xlm: '1000.0000000', usdc: '500.0000000', usdcLimit: '922337203685.4775807', subentries: 1 };
  let account;
  try {
    account = await horizon().loadAccount(address);
  } catch (error) {
    if (error?.response?.status === 404 || error?.name === 'NotFoundError') return { funded: false };
    throw new SettlementError('NETWORK', 'Could not reach Stellar Testnet');
  }
  const xlm = account.balances.find((b) => b.asset_type === 'native');
  const usdc = account.balances.find(
    (b) => b.asset_type !== 'native' && b.asset_code === 'USDC' && b.asset_issuer === CONFIG.config.usdcIssuer,
  );
  return {
    funded: true,
    xlm: xlm?.balance ?? '0',
    usdc: usdc?.balance ?? null,
    usdcLimit: usdc?.limit ?? null,
    subentries: account.subentry_count ?? 0,
  };
}

/**
 * Funds a new Testnet account with test XLM from Friendbot.
 * @param {string} address
 */
export async function fundWithFriendbot(address) {
  const response = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(address)}`);
  if (!response.ok && response.status !== 400) throw new Error(`Friendbot returned ${response.status}`);
  // 400 means the account already exists, which is fine.
}

/**
 * Checks, before anything is signed, that a USDC payment can succeed: the payer exists, holds a USDC trustline,
 * has enough USDC and XLM for the fee, and the recipient exists with a USDC trustline.
 * @param {{ from: string, to: string, amount: string }} payment
 * @returns {Promise<{ payer: AccountBalances }>}
 * @throws {SettlementError}
 */
export async function checkPayment({ from, to, amount }) {
  if (from === to) throw new SettlementError('SAME_ACCOUNT', 'You cannot pay your own wallet');
  const [payer, recipient] = await Promise.all([loadBalances(from), loadBalances(to)]);
  if (!payer.funded) throw new SettlementError('NOT_FUNDED', 'Your wallet does not exist on Testnet yet');
  if (payer.usdc === null) throw new SettlementError('NO_TRUSTLINE', 'Your wallet has no USDC trustline');
  if (toStroops(payer.usdc) < toStroops(amount)) throw new SettlementError('INSUFFICIENT_BALANCE', 'Not enough USDC');
  // Minimum balance: (2 + subentries) × 0.5 XLM, plus a little for the fee.
  const reserve = toStroops(String(1 + payer.subentries * 0.5)) + 10_000n;
  if (toStroops(payer.xlm) < reserve) throw new SettlementError('LOW_XLM', 'Not enough XLM for the network fee');
  if (!recipient.funded || recipient.usdc === null) {
    throw new SettlementError('RECIPIENT_NOT_READY', 'The recipient cannot receive USDC yet');
  }
  return { payer };
}

/**
 * Builds an unsigned USDC payment for a reserved settlement intent. It carries the intent's memo as a
 * MEMO_HASH and expires at the latest when the intent does, as the API requires.
 * @param {{ from: string, to: string, amount: string, memoHash: string, notAfter: string }} payment
 *   memoHash: 64 hex characters from the intent; notAfter: the intent's expiresAt (ISO time)
 * @returns {Promise<{ xdr: string, feeXlm: string }>}
 */
export async function buildUsdcPayment({ from, to, amount, memoHash, notAfter }) {
  return build(from, Operation.payment({ destination: to, asset: usdcAsset(), amount }), {
    memo: Memo.hash(memoHash),
    maxTime: Math.min(Math.floor(Date.parse(notAfter) / 1000), Math.floor(Date.now() / 1000) + TX_TIMEOUT_SECONDS),
  });
}

/**
 * Builds an unsigned transaction that adds a USDC trustline to `from`.
 * @param {string} from
 */
export async function buildUsdcTrustline(from) {
  return build(from, Operation.changeTrust({ asset: usdcAsset() }));
}

/**
 * @param {string} from
 * @param {import('@stellar/stellar-sdk').xdr.Operation} operation
 * @param {{ memo?: import('@stellar/stellar-sdk').Memo, maxTime?: number }} [options] maxTime in Unix seconds
 */
async function build(from, operation, { memo, maxTime } = {}) {
  let account;
  try {
    account = await horizon().loadAccount(from);
  } catch (error) {
    if (error?.response?.status === 404 || error?.name === 'NotFoundError') throw new SettlementError('NOT_FUNDED', 'Account not found');
    throw new SettlementError('NETWORK', 'Could not reach Stellar Testnet');
  }
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
    ...(maxTime ? { timebounds: { minTime: 0, maxTime } } : {}),
  }).addOperation(operation);
  if (memo) builder.addMemo(memo);
  if (!maxTime) builder.setTimeout(TX_TIMEOUT_SECONDS);
  const tx = builder.build();
  return { xdr: tx.toXDR(), feeXlm: (Number(BASE_FEE) / 1e7).toFixed(7) };
}

/**
 * Submits a signed transaction once. Never retries: a timeout means the outcome is unknown, and the
 * transaction hash is returned in the error so the person can check it on the explorer.
 * @param {string} signedXdr
 * @returns {Promise<{ hash: string, ledger: number }>}
 */
export async function submitSigned(signedXdr) {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const hash = tx.hash().toString('hex');
  try {
    const result = await horizon().submitTransaction(tx);
    return { hash: result.hash, ledger: result.ledger };
  } catch (error) {
    throw classifySubmitError(error, hash);
  }
}

/**
 * Maps a Horizon submission failure to a SettlementError.
 * @param {any} error
 * @param {string} hash
 */
export function classifySubmitError(error, hash) {
  const status = error?.response?.status;
  const codes = error?.response?.data?.extras?.result_codes;
  if (!error?.response) return new SettlementError('NETWORK', 'Could not reach Stellar Testnet', { txHash: hash });
  if (status === 504) return new SettlementError('TIMEOUT', 'Stellar did not confirm in time', { txHash: hash });
  const ops = codes?.operations ?? [];
  if (ops.includes('op_underfunded')) return new SettlementError('INSUFFICIENT_BALANCE', 'Not enough USDC', { txHash: hash });
  if (ops.includes('op_src_no_trust')) return new SettlementError('NO_TRUSTLINE', 'No USDC trustline', { txHash: hash });
  if (ops.includes('op_no_trust') || ops.includes('op_no_destination') || ops.includes('op_not_authorized')) {
    return new SettlementError('RECIPIENT_NOT_READY', 'The recipient cannot receive USDC', { txHash: hash });
  }
  if (codes?.transaction === 'tx_too_late') return new SettlementError('EXPIRED', 'The payment expired before it was sent', { txHash: hash });
  if (codes?.transaction === 'tx_insufficient_balance' || codes?.transaction === 'tx_insufficient_fee') {
    return new SettlementError('LOW_XLM', 'Not enough XLM for the network fee', { txHash: hash });
  }
  if (codes) return new SettlementError('REJECTED_BY_NETWORK', `Rejected: ${codes.transaction} ${ops.join(',')}`, { txHash: hash });
  return new SettlementError('UNKNOWN', `Horizon returned ${status}`, { txHash: hash });
}
