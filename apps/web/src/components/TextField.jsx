import { useId } from 'react';
import { cx } from '../lib/cx.js';

/**
 * Labelled text input with hint and error text wired to aria-describedby.
 * @param {import('react').InputHTMLAttributes<HTMLInputElement> & { label: string, hint?: string, error?: string | null,
 *   optional?: boolean, inputClassName?: string }} props
 */
export function TextField({ label, hint, error, optional = false, className, inputClassName, id: idProp, ...rest }) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          'min-h-14 rounded-input border-2 bg-surface px-4 text-base text-text placeholder:text-muted',
          error ? 'border-owe' : 'border-line focus:border-text',
          inputClassName,
        )}
        {...rest}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-owe" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Labelled native select.
 * @param {import('react').SelectHTMLAttributes<HTMLSelectElement> & { label: string, hint?: string,
 *   options: { value: string, label: string }[] }} props
 */
export function SelectField({ label, hint, options, className, id: idProp, ...rest }) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="min-h-14 rounded-input border-2 border-line bg-surface px-4 text-base text-text focus:border-text"
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
