import { Link } from 'react-router';
import { Sheet } from '../../components/Sheet.jsx';
import { IconCamera, IconChevronRight, IconPencil, IconRobot } from '../../components/icons.jsx';
import { cx } from '../../lib/cx.js';

/** @param {{ open: boolean, onClose: () => void, groupId: string }} props */
export function AddExpenseSheet({ open, onClose, groupId }) {
  const options = [
    { to: `/groups/${groupId}/expenses/scan`, title: 'Scan a receipt', body: 'We read the total for you', Icon: IconCamera, highlight: true },
    { to: `/groups/${groupId}/expenses/new`, title: 'Enter it yourself', body: 'Amount, who paid, how to split', Icon: IconPencil },
    { to: '/assist/chat', title: 'Tell Stellar Assist', body: 'Say it in your own words', Icon: IconRobot },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Add an expense">
      <ul className="flex flex-col gap-2">
        {options.map(({ to, title, body, Icon, highlight }) => (
          <li key={to}>
            <Link
              to={to}
              className={cx(
                'flex min-h-18 items-center gap-4 rounded-2xl px-4 py-3',
                highlight ? 'bg-accent text-on-accent' : 'bg-surface-2 text-text hover:bg-line',
              )}
            >
              <Icon />
              <span className="flex flex-1 flex-col">
                <span className="font-semibold">
                  {title}
                  {highlight && <span className="sr-only"> (recommended)</span>}
                </span>
                <span className={cx('text-sm', highlight ? 'opacity-80' : 'text-muted')}>{body}</span>
              </span>
              <IconChevronRight size={18} />
            </Link>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
