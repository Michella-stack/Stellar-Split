import { useId } from 'react';
import { cx } from '../lib/cx.js';

/**
 * On/off switch with a visible label. State is shown by knob position, fill and an "On"/"Off" word.
 * @param {{ label: string, description?: string, checked: boolean, onChange: (checked: boolean) => void,
 *   disabled?: boolean, className?: string }} props
 */
export function Switch({ label, description, checked, onChange, disabled = false, className }) {
  const id = useId();
  return (
    <div className={cx('flex min-h-14 items-center justify-between gap-4', className)}>
      <span className="flex flex-col">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {description && (
          <span id={`${id}-desc`} className="text-sm text-muted">
            {description}
          </span>
        )}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative inline-flex h-11 w-[76px] shrink-0 items-center rounded-full border-2 transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'border-text bg-text' : 'border-line bg-surface-2',
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'absolute text-[10px] font-bold uppercase',
            checked ? 'left-2.5 text-bg' : 'right-2.5 text-muted',
          )}
        >
          {checked ? 'On' : 'Off'}
        </span>
        <span
          aria-hidden="true"
          className={cx(
            'absolute top-1/2 size-8 -translate-y-1/2 rounded-full transition-[left]',
            checked ? 'left-[calc(100%-36px)] bg-accent' : 'left-1 bg-muted',
          )}
        />
      </button>
    </div>
  );
}
