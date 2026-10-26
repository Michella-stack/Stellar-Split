import { Amount } from '../../components/Amount.jsx';
import { IconCheck } from '../../components/icons.jsx';
import { ListRow } from '../../components/ListRow.jsx';
import { useT } from '../../hooks/useT.js';
import { formatDate, memberName, shortAddress } from '../../lib/format.js';

/**
 * One recorded payment. Tapping it opens its receipt, where it can be seen and saved again.
 * @param {{ item: any, detail: any }} props
 */
export function SettlementRow({ item, detail }) {
  const { t } = useT();
  const byId = new Map(detail.members.map((m) => [m.id, m]));
  const from = memberName(byId.get(item.from), detail.me);
  const to = memberName(byId.get(item.to), detail.me);
  return (
    <ListRow
      leading={
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
          <IconCheck size={20} />
        </span>
      }
      title={
        item.from === detail.me
          ? t('activity.paidTo', { to })
          : item.to === detail.me
            ? t('activity.paidYou', { from })
            : t('activity.paidOther', { from, to })
      }
      subtitle={`${item.demo ? `${t('activity.demoPayment', { date: formatDate(item.createdAt) })}` : `${shortAddress(item.txHash)} · ${formatDate(item.createdAt)}`}`}
      to={`/groups/${detail.group.id}/settlements/${item.id}`}
      trailing={<Amount value={item.amount} size="sm" />}
    />
  );
}
