import { cx } from '../lib/cx.js';

/**
 * Horizontal progress bar with an accessible value. `value` and `max` are display numbers, not money maths.
 * @param {{ label: string, value: number, max: number, valueText: string, className?: string }} props
 */
export function Progress({ label, value, max, valueText, className }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className={cx('h-3 w-full overflow-hidden rounded-full bg-surface-2', className)}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}
