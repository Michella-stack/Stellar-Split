import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** Renders `value` as a QR code in SVG. Always dark on white so phone cameras can read it in dark mode. */
export function QrCode({ value, label, className = '' }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { size: count, path: d };
  }, [value]);

  const margin = 4;
  const total = size + margin * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-margin} ${-margin} ${total} ${total}`}
      shapeRendering="crispEdges"
      className={`rounded-lg bg-white ${className}`}
    >
      <path d={path} fill="#000" />
    </svg>
  );
}
