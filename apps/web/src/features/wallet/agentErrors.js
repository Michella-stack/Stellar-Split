/**
 * Plain-words problem for an error from the API or the wallet. Returns an i18n key.
 * The API's code for an unknown agent is not fixed yet (the spec only names AGENT_ALREADY_LINKED), so the
 * likely ones map to the same message.
 * @param {{ code?: string } | null | undefined} error
 */
export function agentErrorKey(error) {
  switch (error?.code) {
    case 'AGENT_ALREADY_LINKED':
      return 'yourAgent.err.alreadyLinked';
    case 'AGENT_UNKNOWN':
    case 'UNKNOWN_AGENT':
    case 'NOT_FOUND':
      return 'yourAgent.err.unknown';
    case 'INVALID_ADDRESS':
    case 'VALIDATION':
      return 'yourAgent.err.invalid';
    case 'UNAUTHORIZED':
      return 'yourAgent.err.session';
    case 'USER_REJECTED':
      return 'yourAgent.err.rejected';
    case 'NOT_INSTALLED':
    case 'LOCKED':
    case 'WRONG_NETWORK':
    case 'ACCOUNT_CHANGED':
      return 'yourAgent.err.wallet';
    default:
      return 'yourAgent.err.generic';
  }
}
