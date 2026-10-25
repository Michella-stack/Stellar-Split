// The one API client for the web app. VITE_USE_MOCKS=true serves in-memory mock data with the same
// shapes as the real API (documented in client/README.md); otherwise requests go to VITE_API_URL.

import { createHttpApi } from './http.js';
import { createMockApi } from './mocks/mockApi.js';

export { ApiError } from './errors.js';

export const USING_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

let sessionToken = /** @type {string | null} */ (null);

/** Sets the session token sent as a Bearer header. Kept in memory only. @param {string | null} token */
export function setSessionToken(token) {
  sessionToken = token;
}

function tabStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const impl = USING_MOCKS
  ? createMockApi({ storage: tabStorage(), addresses: { 'm-mateo': import.meta.env.VITE_MOCK_MATEO_ADDRESS } })
  : createHttpApi({ baseUrl: import.meta.env.VITE_API_URL ?? '', getToken: () => sessionToken });

export const {
  addMember,
  requestChallenge,
  verifyChallenge,
  getMe,
  updateMe,
  listGroups,
  createGroup,
  getGroup,
  createInvite,
  acceptInvite,
  listExpenses,
  createExpense,
  recordSettlement,
  listActivity,
  getAgent,
  updateAgent,
  listAgentActivity,
  approve,
  reject,
} = impl;

/**
 * Stellar Assist has no API routes yet (no /v1/agents or /v1/approvals). Until it does, Assist screens use
 * their own in-memory sample data, even when the rest of the app talks to the real API, and say so.
 */
export const ASSIST_PREVIEW = !USING_MOCKS;
export const assist = USING_MOCKS ? impl : createMockApi({ storage: null });
