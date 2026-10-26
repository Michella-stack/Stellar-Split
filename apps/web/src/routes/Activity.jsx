import { useParams } from 'react-router';
import { getGroup, listActivity } from '../client/api.js';
import { AssetProvider } from '../components/AssetProvider.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconInbox } from '../components/icons.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { ExpenseRow } from '../features/expenses/ExpenseRow.jsx';
import { SettlementRow } from '../features/settlement/SettlementRow.jsx';
import { useApi } from '../hooks/useApi.js';
import { useT } from '../hooks/useT.js';

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
        {loading && !error && <Loading shape="rows" label={t('activity.loading')} />}
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
