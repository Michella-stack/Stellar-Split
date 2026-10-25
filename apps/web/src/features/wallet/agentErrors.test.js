import { describe, expect, it } from 'vitest';
import en from '../../i18n/messages/en.js';
import { agentErrorKey } from './agentErrors.js';

describe('agentErrorKey', () => {
  it('maps the known problems to plain words', () => {
    expect(agentErrorKey({ code: 'AGENT_ALREADY_LINKED' })).toBe('yourAgent.err.alreadyLinked');
    expect(agentErrorKey({ code: 'AGENT_UNKNOWN' })).toBe('yourAgent.err.unknown');
    expect(agentErrorKey({ code: 'USER_REJECTED' })).toBe('yourAgent.err.rejected');
    expect(agentErrorKey(new Error('boom'))).toBe('yourAgent.err.generic');
  });

  it('only returns keys that exist', () => {
    for (const code of ['AGENT_ALREADY_LINKED', 'AGENT_UNKNOWN', 'NOT_FOUND', 'INVALID_ADDRESS', 'UNAUTHORIZED', 'USER_REJECTED', 'LOCKED', 'NETWORK']) {
      expect(en[agentErrorKey({ code })], code).toBeTruthy();
    }
  });
});
