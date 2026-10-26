// Real API client. Same methods and return shapes as mocks/mockApi.js.

import { ApiError } from './errors.js';

const TIMEOUT_MS = 15_000;

/**
 * @param {{ baseUrl: string, getToken: () => string | null }} options
 */
export function createHttpApi({ baseUrl, getToken }) {
  /**
   * @param {'GET' | 'POST' | 'PATCH' | 'DELETE'} method
   * @param {string} path
   * @param {unknown} [body]
   * @param {Record<string, string>} [extraHeaders]
   */
  async function request(method, path, body, extraHeaders = {}) {
    const headers = { Accept: 'application/json', ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (error?.name === 'TimeoutError') throw new ApiError('TIMEOUT', `${method} ${path} timed out`);
      throw new ApiError('NETWORK', `${method} ${path} failed: network error`);
    }

    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload?.error?.code ?? (response.status === 401 ? 'UNAUTHORIZED' : response.status === 404 ? 'NOT_FOUND' : 'UNKNOWN');
      throw new ApiError(code, payload?.error?.message ?? `${method} ${path} returned ${response.status}`, {
        status: response.status,
        details: payload?.error?.details,
      });
    }
    return payload;
  }

  const enc = encodeURIComponent;
  return {
    requestChallenge: (input) => request('POST', '/v1/auth/challenge', input),
    verifyChallenge: (input) => request('POST', '/v1/auth/verify', input),
    getMe: () => request('GET', '/v1/me'),
    updateMe: (patch) => request('PATCH', '/v1/me', patch),
    listGroups: () => request('GET', '/v1/groups'),
    createGroup: (input) => request('POST', '/v1/groups', input),
    getGroup: (groupId) => request('GET', `/v1/groups/${enc(groupId)}`),
    updateGroup: (groupId, patch) => request('PATCH', `/v1/groups/${enc(groupId)}`, patch),
    // Answers { result: 'deleted' } for a group with no history and { result: 'archived' } when it has expenses or payments.
    deleteGroup: (groupId) => request('DELETE', `/v1/groups/${enc(groupId)}`),
    removeMember: (groupId, memberId) => request('DELETE', `/v1/groups/${enc(groupId)}/members/${enc(memberId)}`),
    createInvite: (groupId, input = {}) => request('POST', `/v1/groups/${enc(groupId)}/invites`, input),
    addMember: (groupId, input) => request('POST', `/v1/groups/${enc(groupId)}/members`, input),
    acceptInvite: (code) => request('POST', `/v1/invites/${enc(code)}/accept`),
    listExpenses: (groupId) => request('GET', `/v1/groups/${enc(groupId)}/expenses`),
    // The same idempotency key on a retry makes the API return the first result instead of a duplicate.
    createExpense: (groupId, input, { idempotencyKey } = {}) =>
      request('POST', `/v1/groups/${enc(groupId)}/expenses`, input, idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    createSettlementIntent: (groupId, input) => request('POST', `/v1/groups/${enc(groupId)}/settlements/intents`, input),
    cancelSettlementIntent: (groupId, intentId) =>
      request('POST', `/v1/groups/${enc(groupId)}/settlements/intents/${enc(intentId)}/cancel`),
    recordSettlement: (groupId, input) => request('POST', `/v1/groups/${enc(groupId)}/settlements`, input),
    // Reads a photo of a receipt and returns a draft. It creates nothing: the person reviews it and saves it as an expense.
    scanReceipt: (groupId, input) => request('POST', `/v1/groups/${enc(groupId)}/receipts/scan`, input),
    listActivity: (groupId) => request('GET', `/v1/groups/${enc(groupId)}/activity`),
    getAgent: (agentId) => request('GET', `/v1/agents/${enc(agentId)}`),
    updateAgent: (agentId, patch) => request('PATCH', `/v1/agents/${enc(agentId)}`, patch),
    listAgentActivity: (agentId) => request('GET', `/v1/agents/${enc(agentId)}/activity`),
    // Linking an agent to your account: the owner signs the challenge message with their wallet.
    createAgentLinkChallenge: (input) => request('POST', '/v1/agents/link/challenge', input),
    linkAgent: (input) => request('POST', '/v1/agents/link', input),
    listMyAgents: () => request('GET', '/v1/me/agents'),
    revokeAgent: (address) => request('DELETE', `/v1/me/agents/${enc(address)}`),
    approve: (approvalId) => request('POST', `/v1/approvals/${enc(approvalId)}/approve`),
    reject: (approvalId) => request('POST', `/v1/approvals/${enc(approvalId)}/reject`),
  };
}
