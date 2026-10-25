import { cx } from '../lib/cx.js';
import { useAssetCode } from '../lib/asset.js';
import { formatMoney } from '../lib/format.js';

const SIZES = {
  sm: 'text-base font-semibold',
  md: 'text-2xl font-display-wide',
  lg: 'text-5xl font-display-wide',
  xl: 'text-6xl font-display-wide',
};

/**
 * An amount in the group's asset (dollars for USDC, euros for EURC), with an optional home-currency estimate.
 * Colour (tone) only reinforces the words around it ("you owe", "owes you"); it never carries meaning alone.
 * @param {{ value: string, size?: keyof typeof SIZES, tone?: 'default' | 'owe' | 'owed' | 'inherit',
 *   estimate?: string, className?: string, asset?: string }} props
 *   value: decimal string in the asset. asset: overrides the group's asset (for lists that mix groups). estimate: already formatted, e.g. "€335".
 */
export function Amount({ value, size = 'md', tone = 'default', estimate, className, asset }) {
  const groupCode = useAssetCode();
  return (
    <span className={cx('inline-flex flex-col', className)}>
      <span
        className={cx(
          'tabular-nums',
          SIZES[size],
          tone === 'owe' && 'text-owe',
          tone === 'owed' && 'text-owed',
          tone === 'default' && 'text-text',
        )}
      >
        {formatMoney(value, asset ?? groupCode)}
      </span>
      {estimate && (
        <span className={cx('text-sm', tone === 'inherit' ? 'opacity-80' : 'text-muted')}>
          ≈ {estimate} <span className="sr-only">(</span>estimate<span className="sr-only">)</span>
        </span>
      )}
    </span>
  );
}
