import { createBrowserRouter } from 'react-router';
import AppLayout from './AppLayout.jsx';
import RouteError from './RouteError.jsx';
import Welcome from './Welcome.jsx';
import { RequireWallet } from './guards.jsx';
import { Loading } from '../components/LoadState.jsx';

/**
 * Loads a screen module on first visit, so the first page does not download every screen.
 * @param {() => Promise<{ default: import('react').ComponentType }>} load
 */
const screen = (load) => async () => ({ Component: (await load()).default });

// The add-expense sheet (screen 10) opens over the group screen; the paid and problem
// states (15, 16) are steps inside the settle route, so none of them has its own path.
export const routes = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteError />,
    // Shown while a lazy screen loads on the very first page view.
    hydrateFallbackElement: <Loading />,
    children: [
      { index: true, element: <Welcome /> },
      { path: 'connect', lazy: screen(() => import('./Connect.jsx')) },
      { element: <RequireWallet needs="wallet" />, children: [{ path: 'verify', lazy: screen(() => import('./Verify.jsx')) }] },
      { element: <RequireWallet needs="session" />, children: [{ path: 'onboarding', lazy: screen(() => import('./Onboarding.jsx')) }] },
      {
        element: <RequireWallet />,
        children: [
          { path: 'wallet', lazy: screen(() => import('./Wallet.jsx')) },
          { path: 'groups', lazy: screen(() => import('./Groups.jsx')) },
          { path: 'groups/new', lazy: screen(() => import('./GroupNew.jsx')) },
          { path: 'groups/:id', lazy: screen(() => import('./Group.jsx')) },
          { path: 'groups/:id/invite', lazy: screen(() => import('./GroupInvite.jsx')) },
          { path: 'groups/:id/expenses/new', lazy: screen(() => import('./ExpenseNew.jsx')) },
          { path: 'groups/:id/expenses/scan', lazy: screen(() => import('./ExpenseScan.jsx')) },
          { path: 'groups/:id/activity', lazy: screen(() => import('./Activity.jsx')) },
          { path: 'groups/:id/settle/:memberId', lazy: screen(() => import('./Settle.jsx')) },
          { path: 'join/:code', lazy: screen(() => import('./Join.jsx')) },
          // The API's invite links use /invite/CODE.
          { path: 'invite/:code', lazy: screen(() => import('./Join.jsx')) },
          { path: 'assist', lazy: screen(() => import('./Assist.jsx')) },
          { path: 'assist/intro', lazy: screen(() => import('./AssistIntro.jsx')) },
          { path: 'assist/setup', lazy: screen(() => import('./AssistSetup.jsx')) },
          { path: 'assist/chat', lazy: screen(() => import('./AssistChat.jsx')) },
        ],
      },
    ],
  },
  // Development only: every UI primitive in both themes. Not part of production builds.
  ...(import.meta.env.DEV ? [{ path: '/ui', lazy: screen(() => import('./UiKit.jsx')), errorElement: <RouteError /> }] : []),
];

export function createRouter() {
  return createBrowserRouter(routes);
}
