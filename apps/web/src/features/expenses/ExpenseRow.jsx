import { Amount } from '../../components/Amount.jsx';
import { ListRow } from '../../components/ListRow.jsx';
import { IconReceipt, IconRobot } from '../../components/icons.jsx';
import { formatDate, formatUsd, memberName } from '../../lib/format.js';

/**
 * One expense: what, who paid, my share.
 * @param {{ expense: any, members: any[], meId: string }} props
 */
export function ExpenseRow({ expense, members, meId }) {
  const payer = members.find((m) => m.id === expense.paidBy);
  const myShare = expense.shares?.find((s) => s.memberId === meId)?.amount;
  return (
    <ListRow
      leading={
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2">
          {expense.source === 'agent' ? <IconRobot size={20} /> : <IconReceipt size={20} />}
        </span>
      }
      title={expense.description}
      subtitle={`${memberName(payer, meId)} paid ${formatUsd(expense.amount)} · ${formatDate(expense.createdAt)}`}
      trailing={
        myShare ? (
          <span className="flex flex-col items-end">
            <span className="text-sm text-muted">your share</span>
            <Amount value={myShare} size="sm" />
          </span>
        ) : (
          <span className="text-sm text-muted">not in split</span>
        )
      }
    />
  );
}
