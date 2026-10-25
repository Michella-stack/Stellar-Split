import { Link } from 'react-router';
import { cx } from '../lib/cx.js';
import { IconChevronRight } from './icons.jsx';

/**
 * One row of a list: leading visual, title and subtitle, trailing content. Becomes a link when `to` is set.
 * @param {{ leading?: import('react').ReactNode, title: import('react').ReactNode, subtitle?: import('react').ReactNode,
 *   trailing?: import('react').ReactNode, to?: string, className?: string }} props
 */
export function ListRow({ leading, title, subtitle, trailing, to, className }) {
  const body = (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{title}</span>
        {subtitle && <span className="truncate text-sm text-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right">{trailing}</span>}
      {to && <IconChevronRight size={18} className="shrink-0 text-muted" />}
    </>
  );
  const classes = cx('flex min-h-16 items-center gap-3 py-2', className);
  return to ? (
    <Link to={to} className={cx(classes, '-mx-2 rounded-2xl px-2 hover:bg-surface-2')}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
