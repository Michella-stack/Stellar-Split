import { createBrowserRouter } from 'react-router';
import AppLayout from './AppLayout.jsx';
import RouteError from './RouteError.jsx';
import Welcome from './Welcome.jsx';
import Connect from './Connect.jsx';
import Verify from './Verify.jsx';
import Onboarding from './Onboarding.jsx';
import Wallet from './Wallet.jsx';
import Groups from './Groups.jsx';
import GroupNew from './GroupNew.jsx';
import GroupInvite from './GroupInvite.jsx';
import Join from './Join.jsx';
import Group from './Group.jsx';
import ExpenseNew from './ExpenseNew.jsx';
import ExpenseScan from './ExpenseScan.jsx';
import Activity from './Activity.jsx';
import Settle from './Settle.jsx';
import AssistIntro from './AssistIntro.jsx';
import AssistSetup from './AssistSetup.jsx';
import Assist from './Assist.jsx';
import AssistChat from './AssistChat.jsx';
import UiKit from './UiKit.jsx';

// The add-expense sheet (screen 10) opens over the group screen; the paid and problem
// states (15, 16) are steps inside the settle route, so none of them has its own path.
export const routes = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Welcome /> },
      { path: 'connect', element: <Connect /> },
      { path: 'verify', element: <Verify /> },
      { path: 'onboarding', element: <Onboarding /> },
      { path: 'wallet', element: <Wallet /> },
      { path: 'groups', element: <Groups /> },
      { path: 'groups/new', element: <GroupNew /> },
      { path: 'groups/:id', element: <Group /> },
      { path: 'groups/:id/invite', element: <GroupInvite /> },
      { path: 'groups/:id/expenses/new', element: <ExpenseNew /> },
      { path: 'groups/:id/expenses/scan', element: <ExpenseScan /> },
      { path: 'groups/:id/activity', element: <Activity /> },
      { path: 'groups/:id/settle/:memberId', element: <Settle /> },
      { path: 'join/:code', element: <Join /> },
      { path: 'assist', element: <Assist /> },
      { path: 'assist/intro', element: <AssistIntro /> },
      { path: 'assist/setup', element: <AssistSetup /> },
      { path: 'assist/chat', element: <AssistChat /> },
    ],
  },
  // Development page with every UI primitive in both themes. Full width, so outside AppLayout.
  { path: '/ui', element: <UiKit />, errorElement: <RouteError /> },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
