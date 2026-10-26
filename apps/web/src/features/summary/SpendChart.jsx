import { useState } from 'react';
import { fromStroops } from '@shared/money.js';
import { useT } from '../../hooks/useT.js';
import { useAssetCode } from '../../lib/asset.js';
import { formatMoney } from '../../lib/format.js';
import { compact, niceTicks } from './buckets.js';
import { bucketLabel, bucketRange } from './labels.js';

const W = 320;
const H = 190;
const PAD = { left: 34, right: 4, top: 10, bottom: 24 };
const BASE = H - PAD.bottom;
const MAX_BAR = 24;
const RADIUS = 4;
// How often an axis label is drawn, so neighbours never touch.
const LABEL_EVERY = { day: 2, week: 3, month: 1 };

/** A column with a rounded top and a square foot, so it grows from the baseline. */
function columnPath(x, top, width) {
  const height = BASE - top;
  const r = Math.min(RADIUS, height, width / 2);
  return `M${x},${BASE} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${BASE} Z`;
}

/**
 * Columns of money spent per day, week or month. One series, one colour; the focused column stays solid and the rest step back.
 * The readout appears on hover, tap and keyboard focus, and the same numbers are in the table below the chart.
 * @param {{ buckets: { start: Date, end: Date, total: bigint, count: number }[], period: 'day' | 'week' | 'month', label: string }} props
 */
export function SpendChart({ buckets, period, label }) {
  const { t } = useT();
  const code = useAssetCode();
  const [active, setActive] = useState(/** @type {number | null} */ (null));

  const units = buckets.map((b) => Number(fromStroops(b.total, { minDecimals: 0 })));
  const ticks = niceTicks(Math.max(...units));
  const top = ticks.at(-1);
  const plotW = W - PAD.left - PAD.right;
  const plotH = BASE - PAD.top;
  const slot = plotW / buckets.length;
  const barW = Math.min(MAX_BAR, slot * 0.66);
  const yOf = (value) => BASE - (value / top) * plotH;
  const centre = (i) => PAD.left + slot * i + slot / 2;

  const bucket = active === null ? null : buckets[active];
  // The readout sits above its column, kept inside the card at both edges.
  const readoutLeft = active === null ? 0 : Math.min(Math.max((centre(active) / W) * 100, 22), 78);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={label} className="block w-full select-none" onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yOf(tick)} y2={yOf(tick)} className="stroke-line" strokeWidth="1" />
            <text x={PAD.left - 6} y={yOf(tick)} textAnchor="end" dominantBaseline="middle" className="fill-muted" fontSize="9">
              {compact(tick)}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const x = centre(i) - barW / 2;
          const dimmed = active !== null && active !== i;
          return (
            <g key={b.start.getTime()}>
              {units[i] > 0 && <path d={columnPath(x, yOf(units[i]), barW)} className="fill-primary transition-opacity" opacity={dimmed ? 0.35 : 1} />}
              {i % LABEL_EVERY[period] === (buckets.length - 1) % LABEL_EVERY[period] && (
                <text x={centre(i)} y={H - 7} textAnchor="middle" className="fill-muted" fontSize="9">
                  {bucketLabel(b.start, period, 'axis')}
                </text>
              )}
              {/* The whole slot is the target, so a short or empty column is still easy to hit. */}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH + PAD.bottom - 6}
                fill="transparent"
                tabIndex={0}
                aria-label={t(b.count === 1 ? 'summary.columnLabelOne' : 'summary.columnLabel', { range: bucketRange(b, period), amount: formatMoney(fromStroops(b.total), code), count: b.count })}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none focus-visible:stroke-text"
                strokeWidth="2"
              />
            </g>
          );
        })}
      </svg>
      {bucket && (
        <div
          role="status"
          style={{ left: `${readoutLeft}%` }}
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-2xl bg-text px-3 py-2 text-center text-bg shadow-lg"
        >
          <p className="text-lg leading-tight font-semibold tabular-nums">{formatMoney(fromStroops(bucket.total), code)}</p>
          <p className="text-xs">{bucketRange(bucket, period)}</p>
          <p className="text-xs opacity-70">{t(bucket.count === 1 ? 'summary.expenseCountOne' : 'summary.expenseCount', { count: bucket.count })}</p>
        </div>
      )}
    </div>
  );
}
