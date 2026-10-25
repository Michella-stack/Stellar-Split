import { Link } from 'react-router';
import { TestnetBadge } from './TestnetBadge.jsx';
import { IconArrowLeft } from './icons.jsx';

/**
 * Screen header: optional back link, title, the Testnet badge and an optional action.
 * @param {{ title?: string, backTo?: string, backLabel?: string, action?: import('react').ReactNode }} props
 */
export function TopBar({ title, backTo, backLabel = 'Back', action }) {
  return (
    <header className="flex min-h-16 items-center gap-2 py-2">
      {backTo ? (
        <Link
          to={backTo}
          aria-label={backLabel}
          title={backLabel}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2"
        >
          <IconArrowLeft size={20} />
        </Link>
      ) : (
        <Link to="/" className="flex min-h-11 shrink-0 items-center font-display-wide text-lg">
          Stellar Split
        </Link>
      )}
      <p className="min-w-0 flex-1 truncate text-center font-semibold">{title}</p>
      <TestnetBadge />
      {action}
    </header>
  );
}
