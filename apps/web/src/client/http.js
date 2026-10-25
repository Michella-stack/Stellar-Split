// Real API client. Same methods and return shapes as mocks/mockApi.js.

import { ApiError } from './errors.js';

const TIMEOUT_MS = 15_000;

/**
 * @param {{ baseUrl: string, getToken: () => string | null }} options
 */
export function createHttpApi({ baseUrl, getToken }) {
  /**
   * @param {'GET' | 'POST' | 'PATCH'} method
   * @param {string} path
   * @param {unknown} [body]
   */
  async function request(method, path, body) {
    const headers = { Accept: 'application/json' };
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
    createInvite: (groupId, input = {}) => request('POST', `/v1/groups/${enc(groupId)}/invites`, input),
    acceptInvite: (code) => request('POST', `/v1/invites/${enc(code)}/accept`),
    listExpenses: (groupId) => request('GET', `/v1/groups/${enc(groupId)}/expenses`),
    createExpense: (groupId, input) => request('POST', `/v1/groups/${enc(groupId)}/expenses`, input),
    recordSettlement: (groupId, input) => request('POST', `/v1/groups/${enc(groupId)}/settlements`, input),
    listActivity: (groupId) => request('GET', `/v1/groups/${enc(groupId)}/activity`),
    getAgent: (agentId) => request('GET', `/v1/agents/${enc(agentId)}`),
    updateAgent: (agentId, patch) => request('PATCH', `/v1/agents/${enc(agentId)}`, patch),
    listAgentActivity: (agentId) => request('GET', `/v1/agents/${enc(agentId)}/activity`),
    approve: (approvalId) => request('POST', `/v1/approvals/${enc(approvalId)}/approve`),
    reject: (approvalId) => request('POST', `/v1/approvals/${enc(approvalId)}/reject`),
  };
}
