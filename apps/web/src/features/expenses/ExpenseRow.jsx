import { Amount } from '../../components/Amount.jsx';
import { ListRow } from '../../components/ListRow.jsx';
import { IconReceipt, IconRobot } from '../../components/icons.jsx';
import { useT } from '../../hooks/useT.js';
import { formatDate, formatUsd, memberName } from '../../lib/format.js';

/**
 * One expense: what, who paid, my share.
 * @param {{ expense: any, members: any[], meId: string }} props
 */
export function ExpenseRow({ expense, members, meId }) {
  const { t } = useT();
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
      subtitle={
        payer?.id === meId
          ? t('expense.row.paidYou', { amount: formatUsd(expense.amount), date: formatDate(expense.createdAt) })
          : t('expense.row.paidOther', { name: memberName(payer, meId), amount: formatUsd(expense.amount), date: formatDate(expense.createdAt) })
      }
      trailing={
        myShare ? (
          <span className="flex flex-col items-end">
            <span className="text-sm text-muted">{t('expense.row.yourShare')}</span>
            <Amount value={myShare} size="sm" />
          </span>
        ) : (
          <span className="text-sm text-muted">{t('expense.row.notInSplit')}</span>
        )
      }
    />
  );
}
