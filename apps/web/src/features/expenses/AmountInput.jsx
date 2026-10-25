import { useId } from 'react';
import { useT } from '../../hooks/useT.js';
import { cleanAmountInput } from './splitPreview.js';

/**
 * Large amount entry in USDC. Only digits and one decimal point, up to 7 decimals.
 * @param {{ value: string, onChange: (value: string) => void, error?: string | null, label?: string }} props
 */
export function AmountInput({ value, onChange, error, label }) {
  const { t } = useT();
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label ?? t('expense.amountLabel')}
      </label>
      <div className="flex items-baseline gap-2 rounded-card bg-surface px-5 py-4 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-text">
        <span aria-hidden="true" className="font-display-wide text-5xl text-muted">
          $
        </span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-unit`}
          value={value}
          onChange={(e) => onChange(cleanAmountInput(e.target.value))}
          className="w-full min-w-0 bg-transparent font-display-wide text-5xl tabular-nums placeholder:text-line focus:outline-none"
        />
        <span id={`${id}-unit`} className="font-mono text-sm text-muted">
          USDC
        </span>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-owe">
          {error}
        </p>
      )}
    </div>
  );
}
