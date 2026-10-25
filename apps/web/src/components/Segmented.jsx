import { useId } from 'react';
import { cx } from '../lib/cx.js';

/**
 * Segmented control built on native radio inputs, so arrow keys and screen readers work out of the box.
 * @param {{ label: string, options: { value: string, label: string }[], value: string,
 *   onChange: (value: string) => void, hideLabel?: boolean, className?: string }} props
 */
export function Segmented({ label, options, value, onChange, hideLabel = false, className }) {
  const name = useId();
  return (
    <fieldset className={cx('flex flex-col gap-2', className)}>
      <legend className={cx('mb-2 text-sm font-medium', hideLabel && 'sr-only')}>{label}</legend>
      <div className="flex rounded-full bg-surface-2 p-1">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cx(
                'relative flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors',
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-text',
                checked ? 'bg-text text-bg' : 'text-muted hover:text-text',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
