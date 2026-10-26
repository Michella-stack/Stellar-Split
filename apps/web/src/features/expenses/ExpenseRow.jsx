import { Amount } from '../../components/Amount.jsx';
import { ListRow } from '../../components/ListRow.jsx';
import { IconReceipt, IconRobot } from '../../components/icons.jsx';
import { useT } from '../../hooks/useT.js';
import { useAssetCode } from '../../lib/asset.js';
import { formatDate, formatMoney, memberName } from '../../lib/format.js';

/**
 * One expense: what, who paid, my share.
 * @param {{ expense: any, members: any[], meId: string }} props
 */
export function ExpenseRow({ expense, members, meId }) {
  const { t } = useT();
  const code = useAssetCode();
  const payer = members.find((m) => m.id === expense.paidBy);
  const myShare = expense.shares?.find((s) => s.memberId === meId)?.amount;
  // An expense entered in another currency shows what was typed first, then what it counts for in the group (ADR 0011).
  const total = expense.original
    ? t('expense.row.converted', { original: formatMoney(expense.original.amount, expense.original.currency), amount: formatMoney(expense.amount, code) })
    : formatMoney(expense.amount, code);
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
          ? t('expense.row.paidYou', { amount: total, date: formatDate(expense.createdAt) })
          : t('expense.row.paidOther', { name: memberName(payer, meId), amount: total, date: formatDate(expense.createdAt) })
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
