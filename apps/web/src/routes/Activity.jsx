import { useParams } from 'react-router';
import { getGroup, listActivity } from '../client/api.js';
import { Amount } from '../components/Amount.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconCheck, IconExternal, IconInbox } from '../components/icons.jsx';
import { ListRow } from '../components/ListRow.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { EXPLORER_TX_URL } from '../config/env.js';
import { ExpenseRow } from '../features/expenses/ExpenseRow.jsx';
import { useApi } from '../hooks/useApi.js';
import { formatDate, memberName, shortAddress } from '../lib/format.js';

export default function Activity() {
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
      <TopBar backTo={`/groups/${id}`} title={group.data?.group.name ?? 'Activity'} />
      <div className="flex flex-col gap-4 pb-8">
        <h1 className="font-display-wide text-4xl">Activity</h1>
        {loading && !error && <Loading label="Loading activity" />}
        {error && <LoadError title="Could not load activity" error={error} onRetry={reload} />}
        {group.data && activity.data && (
          activity.data.items.length === 0 ? (
            <EmptyState icon={<IconInbox />} title="Nothing yet">
              Expenses and payments in this group will show up here.
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
          )
        )}
      </div>
    </>
  );
}

/** @param {{ item: any, detail: any }} props */
function SettlementRow({ item, detail }) {
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
      title={`${from} paid ${to === 'You' ? 'you' : to}`}
      subtitle={
        <a
          href={`${EXPLORER_TX_URL}${item.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1 font-mono underline underline-offset-4"
        >
          {shortAddress(item.txHash)} · {formatDate(item.createdAt)} <IconExternal size={14} />
          <span className="sr-only">(view transaction on Stellar Expert, opens in a new tab)</span>
        </a>
      }
      trailing={<Amount value={item.amount} size="sm" />}
    />
  );
}
