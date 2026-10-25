// ledgerly_settle: pays a reserved settlement intent with a classic Stellar payment (x402-style, self-verified).
// The signer secret lives only in this closure. Every message that leaves it goes through `scrub`.
import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { toUnits } from "./tools.js";

// Pinned config (testnet). The model and the API never choose these.
export const NETWORK = "stellar:testnet";
export const ASSETS = {
  USDC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  EURC: "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO",
};
export const MAX_AMOUNT = 25n * 10_000_000n; // hard ceiling in the MCP, whatever the API allows
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
const explorer = (hash) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
const stroops = (v) => (typeof v === "string" && /^\d{1,12}(\.\d{1,7})?$/.test(v) ? toUnits(v) : null);

export class Abort extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

/** Exactly one `accepts` entry must match the reserved intent and the pinned config (FR-38). Throws Abort otherwise. */
export function checkTerms(terms, intent, apiHost) {
  const accepts = Array.isArray(terms?.accepts) ? terms.accepts : [];
  const issuer = ASSETS[intent.asset?.code];
  if (!issuer || intent.asset.issuer !== issuer) throw new Abort("terms_mismatch", "the intent asset is not a pinned asset");
  const want = `${intent.asset.code}:${issuer}`;
  const host = (u) => {
    try {
      return new URL(u).host;
    } catch {
      return null;
    }
  };
  const matches = accepts.filter(
    (a) =>
      a?.scheme === "exact" &&
      a.network === NETWORK &&
      a.asset === want &&
      a.payTo === intent.payTo &&
      stroops(a.amount) === stroops(intent.amount) &&
      a.extra?.memoType === "hash" &&
      String(a.extra.memo).toLowerCase() === intent.memo.value.toLowerCase() &&
      a.extra.intentId === intent.id &&
      host(a.resource) === apiHost,
  );
  if (matches.length !== 1) {
    throw new Abort("terms_mismatch", `payment terms do not match the reserved intent (${matches.length} matching entries); nothing was signed`);
  }
}

/**
 * @param {{ secret: string, apiUrl: string, api: object, horizonUrl?: string, fetchImpl?: typeof fetch, now?: () => number }} o
 * @returns {(args: object) => Promise<{ txHash: string, explorerUrl: string, status: string }>} throws Abort on any refusal or failure
 */
export function createSettler({ secret, apiUrl, api, horizonUrl = HORIZON_URL, fetchImpl = globalThis.fetch, now = Date.now }) {
  const key = secret.trim();
  const keypair = Keypair.fromSecret(key);
  const apiHost = new URL(apiUrl).host;
  const horizon = horizonUrl.replace(/\/+$/, "");
  const signed = new Set(); // intent ids this process has signed for; never signed twice
  const done = new Map(); // idempotency_key -> result

  const scrub = (s) => String(s).split(key).join("[redacted]");

  async function horizonCall(path, init) {
    try {
      return await fetchImpl(horizon + path, { ...init, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new Abort("horizon_unreachable", "Horizon is unreachable or timed out");
    }
  }

  async function settle({ group_id, to, amount, on_behalf_of, idempotency_key }) {
    if (idempotency_key && done.has(idempotency_key)) return done.get(idempotency_key);
    const want = stroops(amount);
    if (want === null || want <= 0n) throw new Abort("invalid_amount", "invalid amount");
    if (want > MAX_AMOUNT) throw new Abort("amount_over_ceiling", "amount is above the 25 limit of this tool; nothing was reserved");

    const reserved = await api.reserveIntent(group_id, { to, amount, ...(on_behalf_of ? { onBehalfOf: on_behalf_of } : {}) });
    if (!reserved.ok) throw new Abort(reserved.error.code, reserved.error.message);
    const intent = reserved.data?.intent;
    if (!intent?.id || !intent.memo?.value || stroops(intent.amount) !== want) {
      throw new Abort("terms_mismatch", "the reserved intent does not match the request; nothing was signed");
    }
    if ((intent.payer ?? intent.payFrom) !== keypair.publicKey()) {
      throw new Abort("terms_mismatch", "the intent payer is not the signer account; nothing was signed");
    }

    const first = await api.x402(group_id, intent.id);
    if (first.status !== 402 || !first.data?.accepts) {
      throw new Abort(first.error?.code ?? "unexpected_reply", first.error?.message ?? "the API did not answer with payment terms");
    }
    checkTerms(first.data, intent, apiHost);

    const maxTime = Math.floor(Date.parse(intent.expiresAt) / 1000);
    if (!Number.isFinite(maxTime) || maxTime * 1000 <= now() + 5_000) throw new Abort("intent_expired", "the intent has expired or is about to; nothing was signed");
    if (signed.has(intent.id)) throw new Abort("already_signed", "this intent was already signed by this process");
    signed.add(intent.id); // before building: a failure after this point must never lead to a second signature

    const accRes = await horizonCall(`/accounts/${keypair.publicKey()}`, { headers: { accept: "application/json" } });
    if (!accRes.ok) throw new Abort("signer_account_unavailable", `signer account lookup failed (HTTP ${accRes.status})`);
    const { sequence } = await accRes.json();
    const tx = new TransactionBuilder(new Account(keypair.publicKey(), sequence), { fee: "1000", networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination: intent.payTo, asset: new Asset(intent.asset.code, intent.asset.issuer), amount: intent.amount }))
      .addMemo(Memo.hash(intent.memo.value))
      .setTimebounds(0, maxTime)
      .build();
    tx.sign(keypair);
    const txHash = Buffer.from(tx.hash()).toString("hex");

    const sub = await horizonCall("/transactions", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ tx: tx.toEnvelope().toXDR("base64") }).toString(),
    });
    if (!sub.ok) {
      const codes = (await sub.json().catch(() => null))?.extras?.result_codes;
      throw new Abort("submit_failed", `Horizon rejected the transaction (${JSON.stringify(codes ?? sub.status)}); it was signed once and will not be re-signed`);
    }

    const paid = await api.x402(group_id, intent.id, b64({ x402Version: 1, scheme: "exact", network: NETWORK, payload: { txHash } }));
    if (!paid.ok) {
      throw new Abort(paid.error.code, `the payment was submitted but the API did not record it: ${paid.error.message}`, { txHash, explorerUrl: explorer(txHash) });
    }
    const result = { txHash, explorerUrl: explorer(txHash), status: "settled" };
    if (idempotency_key) done.set(idempotency_key, result);
    return result;
  }

  // Abort messages are ours. Anything else becomes a generic error so no library text can carry the secret.
  return async (args) => {
    try {
      return await settle(args);
    } catch (e) {
      if (e instanceof Abort) throw new Abort(e.code, scrub(e.message), e.extra);
      throw new Abort("settle_failed", "settlement failed before completion");
    }
  };
}
