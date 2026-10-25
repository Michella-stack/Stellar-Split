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

const impl = USING_MOCKS
  ? createMockApi()
  : createHttpApi({ baseUrl: import.meta.env.VITE_API_URL ?? '', getToken: () => sessionToken });

export const {
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
