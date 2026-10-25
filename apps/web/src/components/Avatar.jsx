import { cx } from '../lib/cx.js';
import { initials } from '../lib/format.js';
import { IconRobot } from './icons.jsx';

// Pastel fills always carry dark text (#0B0B0D), so they read the same in both themes.
const FILLS = ['#C9A8FF', '#FF9F5A', '#7CF5FF', '#FFD84D'];

const SIZES = { sm: 'size-8 text-xs', md: 'size-11 text-sm', lg: 'size-16 text-xl' };

/** @param {string} key */
function fillFor(key) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return FILLS[hash % FILLS.length];
}

/**
 * Circle with initials. Decorative when the name is printed next to it; pass `label` otherwise.
 * @param {{ name: string, id?: string, size?: keyof typeof SIZES, label?: string, className?: string }} props
 */
export function Avatar({ name, id, size = 'md', label, className }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ backgroundColor: fillFor(id ?? name) }}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#0b0b0d]', SIZES[size], className)}
    >
      {initials(name)}
    </span>
  );
}

/**
 * The agent's avatar: dashed outline with a robot icon.
 * @param {{ size?: keyof typeof SIZES, label?: string, className?: string }} props
 */
export function AgentAvatar({ size = 'md', label, className }) {
  const iconSize = size === 'lg' ? 28 : size === 'sm' ? 16 : 20;
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted text-text', SIZES[size], className)}
    >
      <IconRobot size={iconSize} />
    </span>
  );
}
