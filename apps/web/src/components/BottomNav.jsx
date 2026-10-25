import { NavLink } from 'react-router';
import { cx } from '../lib/cx.js';
import { IconRobot, IconUsers, IconWallet } from './icons.jsx';

const ITEMS = [
  { to: '/groups', label: 'Groups', Icon: IconUsers },
  { to: '/assist', label: 'Assist', Icon: IconRobot },
  { to: '/wallet', label: 'Wallet', Icon: IconWallet },
];

/** Main navigation. NavLink sets aria-current="page" on the active item. */
export function BottomNav() {
  return (
    <nav aria-label="Main" className="sticky bottom-0 z-10 -mx-4 mt-auto border-t border-line bg-bg/95 px-4 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="flex">
        {ITEMS.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cx(
                  'flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold',
                  isActive ? 'text-text' : 'text-muted hover:text-text',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx('flex h-8 w-14 items-center justify-center rounded-full', isActive && 'bg-surface-2')}>
                    <Icon size={22} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
