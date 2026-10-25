import { Link, Outlet } from 'react-router';
import { useTheme } from '../hooks/useTheme.js';

// Phase 1 shell. TopBar, TestnetBadge and the theme controls move to components/ in the UI kit phase.
export default function AppLayout() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-4">
      <header className="flex items-center justify-between gap-3 py-3">
        <Link to="/" className="flex min-h-11 items-center font-display-wide text-lg">
          Stellar Split
        </Link>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-line px-3 py-1 font-mono text-xs text-muted">Testnet</span>
          <button
            type="button"
            onClick={toggleTheme}
            className="min-h-11 rounded-full bg-surface-2 px-4 text-sm font-medium"
          >
            Use {nextTheme} theme
          </button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
