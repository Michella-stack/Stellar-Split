import { cx } from '../lib/cx.js';

const TONES = {
  neutral: 'border border-line text-muted',
  solid: 'bg-surface-2 text-text',
  owe: 'border border-owe text-owe',
  owed: 'border border-owed text-owed',
  accent: 'bg-accent text-on-accent',
};

/**
 * Small non-interactive label.
 * @param {{ tone?: keyof typeof TONES, mono?: boolean, className?: string, title?: string, children: import('react').ReactNode }} props
 */
export function Pill({ tone = 'neutral', mono = false, className, title, children }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
        mono && 'font-mono',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
