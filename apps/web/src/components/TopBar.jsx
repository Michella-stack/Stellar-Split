import { Link } from 'react-router';
import { useT } from '../hooks/useT.js';
import { Logo } from './Logo.jsx';
import { TestnetBadge } from './TestnetBadge.jsx';
import { IconArrowLeft } from './icons.jsx';

/**
 * Screen header: optional back link, title, the Testnet badge and an optional action.
 * @param {{ title?: string, backTo?: string, backLabel?: string, action?: import('react').ReactNode }} props
 */
export function TopBar({ title, backTo, backLabel, action }) {
  const { t } = useT();
  const back = backLabel ?? t('common.back');
  return (
    <header className="flex min-h-16 items-center gap-2 py-2">
      {backTo ? (
        <Link
          to={backTo}
          aria-label={back}
          title={back}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2"
        >
          <IconArrowLeft size={20} />
        </Link>
      ) : (
        <Link to="/" aria-label={t('common.appName')} className="flex min-h-11 shrink-0 items-center">
          <Logo />
        </Link>
      )}
      <p className="min-w-0 flex-1 truncate text-center font-semibold">{title}</p>
      <TestnetBadge />
      {action}
    </header>
  );
}
