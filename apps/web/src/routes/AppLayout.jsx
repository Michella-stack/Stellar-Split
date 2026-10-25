import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { BottomNav } from '../components/BottomNav.jsx';
import { Loading } from '../components/LoadState.jsx';

// Top-level sections show the bottom navigation; flows inside them (forms, settle up) do not.
const NAV_PATHS = new Set(['/groups', '/assist', '/wallet']);

export default function AppLayout() {
  const { pathname } = useLocation();
  const mainRef = useRef(/** @type {HTMLElement | null} */ (null));
  const firstRender = useRef(true);

  // After client-side navigation, move focus to the new screen so keyboard and screen-reader users start there.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: false });
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-4">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-3 focus:text-on-primary"
      >
        Skip to content
      </a>
      <main id="main" ref={mainRef} tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      {NAV_PATHS.has(pathname.replace(/\/$/, '')) && <BottomNav />}
    </div>
  );
}
