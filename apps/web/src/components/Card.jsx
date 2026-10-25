import { cx } from '../lib/cx.js';

/**
 * Rounded surface. `tone="accent"` fills it with the accent colour and dark text.
 * @param {import('react').HTMLAttributes<HTMLElement> & { tone?: 'surface' | 'accent' | 'outline', as?: 'div' | 'section' | 'article' }} props
 */
export function Card({ tone = 'surface', as: As = 'div', className, children, ...rest }) {
  return (
    <As
      className={cx(
        'rounded-card p-5',
        tone === 'surface' && 'bg-surface text-text',
        tone === 'accent' && 'bg-accent text-on-accent',
        tone === 'outline' && 'border border-line text-text',
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}
