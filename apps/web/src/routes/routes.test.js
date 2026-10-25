import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router';
import { routes } from './index.jsx';

const paths = [
  '/', '/connect', '/verify', '/onboarding', '/wallet', '/groups', '/groups/new', '/groups/g1',
  '/groups/g1/invite', '/groups/g1/expenses/new', '/groups/g1/expenses/scan', '/groups/g1/activity',
  '/groups/g1/settle/m2', '/join/abc', '/assist', '/assist/intro', '/assist/setup', '/assist/chat',
];

describe('routes', () => {
  it.each(paths)('matches %s', (path) => {
    expect(matchRoutes(routes, path)).not.toBeNull();
  });

  it('keeps /groups/new from matching as a group id', () => {
    const match = matchRoutes(routes, '/groups/new');
    expect(match.at(-1).route.path).toBe('groups/new');
  });
});
