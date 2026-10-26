// Thin client for the Ledgerly REST API. The agent's API credential is attached here and never returned to the model.

export function createApi({ baseUrl, token, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
  const base = baseUrl.replace(/\/+$/, "");

  async function call(method, path, { body, headers } = {}) {
    let res;
    try {
      res = await fetchImpl(base + path, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          ...(body ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false, status: 0, error: { code: "network_error", message: "API unreachable or timed out" } };
    }
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (res.ok) return { ok: true, status: res.status, data };
    const err = data?.error ?? data; // the API answers { error: { code, message } }
    return {
      ok: false,
      status: res.status,
      ...(res.status === 402 ? { data } : {}), // a 402 carries the payment terms in its body
      error: {
        code: String(err?.code ?? `http_${res.status}`).slice(0, 64),
        message: String(err?.message ?? res.statusText ?? "request failed").slice(0, 300),
      },
    };
  }

  const group = (id) => `/v1/groups/${encodeURIComponent(id)}`;

  // The tools use names that read well for a model; the API names its fields paidBy, split.type and memberId.
  const toApiExpense = ({ payer, amount, description, split }) => ({
    paidBy: payer,
    amount,
    description,
    split:
      split.rule === "equal"
        ? { type: "equal", participants: split.participants }
        : { type: "exact", shares: split.shares.map((s) => ({ memberId: s.member, amount: s.amount })) },
  });

  return {
    listGroups: () => call("GET", "/v1/groups"),
    getBalances: (groupId) => call("GET", `${group(groupId)}/balances`),
    createExpense: (groupId, body, idempotencyKey) =>
      call("POST", `${group(groupId)}/expenses`, { body: toApiExpense(body), headers: { "idempotency-key": idempotencyKey } }),
    // dry_run returns the settlement intent (who to pay, how much, which asset) without recording or paying anything.
    reserveIntent: (groupId, body) => call("POST", `${group(groupId)}/settlements/intents`, { body }),
    // Without a payment header the API answers 402 with the terms; with one it verifies the transaction and records it.
    x402: (groupId, intentId, paymentSignature) =>
      call("POST", `${group(groupId)}/settlements/intents/${encodeURIComponent(intentId)}/x402`, {
        headers: paymentSignature ? { "payment-signature": paymentSignature } : {},
      }),
    proposeSettlement: (groupId, body) => call("POST", `${group(groupId)}/settlements?dry_run=true`, { body }),
  };
}
