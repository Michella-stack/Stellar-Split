import { cx } from '../lib/cx.js';

/**
 * Round 44 px icon-only button. `label` is required because the icon is decorative.
 * @param {import('react').ButtonHTMLAttributes<HTMLButtonElement> & { label: string, variant?: 'surface' | 'plain' }} props
 */
export function IconButton({ label, variant = 'surface', className, children, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'surface' ? 'bg-surface-2 text-text hover:bg-line' : 'text-text hover:bg-surface-2',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
