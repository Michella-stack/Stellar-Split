import { Outlet, useLocation } from 'react-router';
import { BottomNav } from '../components/BottomNav.jsx';

// Top-level sections show the bottom navigation; flows inside them (forms, settle up) do not.
const NAV_PATHS = new Set(['/groups', '/assist', '/wallet']);

export default function AppLayout() {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-4">
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      {NAV_PATHS.has(pathname.replace(/\/$/, '')) && <BottomNav />}
    </div>
  );
}
