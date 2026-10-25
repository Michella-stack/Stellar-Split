import { Link } from 'react-router';
import { cx } from '../lib/cx.js';

const VARIANTS = {
  primary: 'bg-primary text-on-primary',
  accent: 'bg-accent text-on-accent',
  // For use on an accent-filled card: dark fill in both themes.
  onAccent: 'bg-[#0b0b0d] text-white',
  secondary: 'bg-surface-2 text-text',
  outline: 'border-2 border-line text-text',
  ghost: 'text-text underline-offset-4 hover:underline',
};

/**
 * @param {{ variant?: keyof typeof VARIANTS, block?: boolean, className?: string }} opts
 */
function buttonClasses({ variant = 'primary', block = false, className }) {
  return cx(
    'inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold',
    'transition-[filter,transform] active:scale-[0.98] hover:brightness-95',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
    VARIANTS[variant],
    block && 'w-full',
    className,
  );
}

/**
 * Pill button, 56 px tall.
 * @param {import('react').ButtonHTMLAttributes<HTMLButtonElement> & {
 *   variant?: 'primary' | 'accent' | 'onAccent' | 'secondary' | 'outline' | 'ghost',
 *   block?: boolean, loading?: boolean, icon?: import('react').ReactNode }} props
 */
export function Button({ variant, block, loading = false, icon, className, children, disabled, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

/**
 * A link that looks like a Button.
 * @param {import('react-router').LinkProps & { variant?: 'primary' | 'accent' | 'onAccent' | 'secondary' | 'outline' | 'ghost',
 *   block?: boolean, icon?: import('react').ReactNode }} props
 */
export function ButtonLink({ variant, block, icon, className, children, ...rest }) {
  return (
    <Link className={buttonClasses({ variant, block, className })} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

function Spinner() {
  return <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}
