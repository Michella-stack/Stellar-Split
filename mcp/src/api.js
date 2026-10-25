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
    return {
      ok: false,
      status: res.status,
      error: {
        code: String(data?.code ?? `http_${res.status}`).slice(0, 64),
        message: String(data?.message ?? res.statusText ?? "request failed").slice(0, 300),
      },
    };
  }

  const group = (id) => `/v1/groups/${encodeURIComponent(id)}`;
  return {
    listGroups: () => call("GET", "/v1/groups"),
    getBalances: (groupId) => call("GET", `${group(groupId)}/balances`),
    createExpense: (groupId, body, idempotencyKey) =>
      call("POST", `${group(groupId)}/expenses`, { body, headers: { "idempotency-key": idempotencyKey } }),
    // dry_run returns the settlement intent and payment requirements without paying anything.
    proposeSettlement: (groupId, body) => call("POST", `${group(groupId)}/settlements?dry_run=true`, { body }),
    getApproval: (approvalId) => call("GET", `/v1/approvals/${encodeURIComponent(approvalId)}`),
  };
}
