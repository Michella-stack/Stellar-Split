import { cx } from '../lib/cx.js';
import { IconCheck } from './icons.jsx';

/**
 * Toggleable chip. Selection is shown by fill, a check mark and aria-pressed, never by colour alone.
 * @param {import('react').ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean, icon?: import('react').ReactNode }} props
 */
export function Chip({ selected = false, icon, className, children, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-medium transition-colors',
        selected ? 'border-text bg-text text-bg' : 'border-line text-text hover:border-muted',
        className,
      )}
      {...rest}
    >
      {selected ? <IconCheck size={16} /> : icon}
      {children}
    </button>
  );
}
