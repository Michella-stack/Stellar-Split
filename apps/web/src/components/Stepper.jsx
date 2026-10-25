import { useId } from 'react';
import { useT } from '../hooks/useT.js';
import { cx } from '../lib/cx.js';
import { IconButton } from './IconButton.jsx';
import { IconMinus, IconPlus } from './icons.jsx';

/**
 * Whole-number stepper (e.g. dollars for a spending limit).
 * @param {{ label: string, value: number, onChange: (value: number) => void, min?: number, max?: number,
 *   step?: number, format?: (value: number) => string, description?: string, className?: string }} props
 */
export function Stepper({ label, value, onChange, min = 0, max = Infinity, step = 1, format = String, description, className }) {
  const id = useId();
  const { t } = useT();
  const shown = format(value);
  return (
    <div role="group" aria-labelledby={`${id}-label`} className={cx('flex min-h-14 items-center justify-between gap-4', className)}>
      <span className="flex flex-col">
        <span id={`${id}-label`} className="font-medium">
          {label}
        </span>
        {description && <span className="text-sm text-muted">{description}</span>}
      </span>
      <span className="flex items-center gap-2">
        <IconButton label={t('common.decrease', { label })} disabled={value - step < min} onClick={() => onChange(value - step)}>
          <IconMinus size={20} />
        </IconButton>
        <output aria-live="polite" className="min-w-14 text-center font-mono text-lg font-semibold tabular-nums">
          {shown}
        </output>
        <IconButton label={t('common.increase', { label })} disabled={value + step > max} onClick={() => onChange(value + step)}>
          <IconPlus size={20} />
        </IconButton>
      </span>
    </div>
  );
}
