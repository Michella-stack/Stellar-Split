import { useParams } from 'react-router';
import { getGroup, listActivity } from '../client/api.js';
import { Amount } from '../components/Amount.jsx';
import { AssetProvider } from '../components/AssetProvider.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconCheck, IconInbox } from '../components/icons.jsx';
import { ListRow } from '../components/ListRow.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { ExpenseRow } from '../features/expenses/ExpenseRow.jsx';
import { useApi } from '../hooks/useApi.js';
import { useT } from '../hooks/useT.js';
import { formatDate, memberName, shortAddress } from '../lib/format.js';

export default function Activity() {
  const { t } = useT();
  const { id } = useParams();
  const group = useApi(() => getGroup(id), `group:${id}`);
  const activity = useApi(() => listActivity(id), `activity:${id}`);
  const loading = group.loading || activity.loading;
  const error = group.error ?? activity.error;
  const reload = () => {
    group.reload();
    activity.reload();
  };

  return (
    <>
      <TopBar backTo={`/groups/${id}`} title={group.data?.group.name ?? t('activity.title')} />
      <div className="flex flex-col gap-4 pb-8">
        <h1 className="font-display-wide text-4xl">{t('activity.title')}</h1>
        {loading && !error && <Loading label={t('activity.loading')} />}
        {error && <LoadError title={t('activity.loadError')} error={error} onRetry={reload} />}
        {group.data && activity.data && (
          <AssetProvider group={group.data.group}>
          {activity.data.items.length === 0 ? (
            <EmptyState icon={<IconInbox />} title={t('activity.emptyTitle')}>
              {t('activity.emptyBody')}
            </EmptyState>
          ) : (
            <ul className="flex flex-col">
              {activity.data.items.map((item) => (
                <li key={item.id}>
                  {item.type === 'expense' ? (
                    <ExpenseRow expense={item} members={group.data.members} meId={group.data.me} />
                  ) : (
                    <SettlementRow item={item} detail={group.data} />
                  )}
                </li>
              ))}
            </ul>
          )}
          </AssetProvider>
        )}
      </div>
    </>
  );
}

/** @param {{ item: any, detail: any }} props */
function SettlementRow({ item, detail }) {
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
