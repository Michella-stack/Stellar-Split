import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { getGroup, listActivity } from '../client/api.js';
import { AssetProvider } from '../components/AssetProvider.jsx';
import { Button } from '../components/Button.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconButton } from '../components/IconButton.jsx';
import { IconPlus, IconReceipt, IconShare } from '../components/icons.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { BalanceCard } from '../features/balances/BalanceCard.jsx';
import { BalanceList } from '../features/balances/BalanceList.jsx';
import { AddExpenseSheet } from '../features/expenses/AddExpenseSheet.jsx';
import { ExpenseRow } from '../features/expenses/ExpenseRow.jsx';
import { latestActivity } from '../features/groups/latestActivity.js';
import { MembersRow } from '../features/groups/MembersRow.jsx';
import { SettlementRow } from '../features/settlement/SettlementRow.jsx';
import { useApi } from '../hooks/useApi.js';
import { useT } from '../hooks/useT.js';
import { useWallet } from '../hooks/useWallet.js';

const LATEST = 3;

export default function Group() {
  const { t } = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useWallet();
  const [sheetOpen, setSheetOpen] = useState(false);
  const group = useApi(() => getGroup(id), `group:${id}`);
  const activity = useApi(() => listActivity(id), `activity:${id}`);
  const detail = group.data;

  return (
    <>
      <TopBar
        backTo="/groups"
        backLabel={t('group.backToGroups')}
        title={detail?.group.name}
        action={
          <IconButton label={t('group.invitePeople')} onClick={() => navigate(`/groups/${id}/invite`)}>
            <IconShare size={20} />
          </IconButton>
        }
      />
      {group.loading && <Loading shape="group" label={t('group.loading')} />}
      {group.error && <LoadError title={t('group.loadError')} error={group.error} onRetry={group.reload} />}
      {detail && (
        <AssetProvider group={detail.group}>
        <div className="flex flex-col gap-6 pb-28">
          <h1 className="sr-only">{detail.group.name}</h1>
          <MembersRow members={detail.members} meId={detail.me} />
          <BalanceCard detail={detail} homeCurrency={profile?.homeCurrency ?? null} />

          <section aria-labelledby="balances-title" className="flex flex-col gap-1">
            <h2 id="balances-title" className="text-lg font-semibold">
              {t('group.everyoneBalance')}
            </h2>
            <BalanceList detail={detail} />
          </section>

          <section aria-labelledby="expenses-title" className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <h2 id="expenses-title" className="text-lg font-semibold">
                {t('group.latestActivity')}
              </h2>
              <Link to={`/groups/${id}/activity`} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
                {t('group.allActivity')}
              </Link>
            </div>
            {activity.loading && <Loading shape="rows" label={t('group.loadingExpenses')} />}
            {activity.error && <LoadError title={t('group.expensesError')} error={activity.error} onRetry={activity.reload} />}
            {activity.data &&
              (activity.data.items.length === 0 ? (
                <EmptyState icon={<IconReceipt />} title={t('group.noExpenses')}>
                  {t('group.noExpensesBody')}
                </EmptyState>
              ) : (
                <ul>
                  {latestActivity(activity.data.items, LATEST).map((item) => (
                    <li key={item.id}>
                      {item.type === 'expense' ? (
                        <ExpenseRow expense={item} members={detail.members} meId={detail.me} />
                      ) : (
                        <SettlementRow item={item} detail={detail} />
                      )}
                    </li>
                  ))}
                </ul>
              ))}
          </section>

          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[480px] justify-end px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Button variant="primary" icon={<IconPlus size={20} />} onClick={() => setSheetOpen(true)} className="pointer-events-auto shadow-lg">
              {t('group.addExpense')}
            </Button>
          </div>
          <AddExpenseSheet open={sheetOpen} onClose={() => setSheetOpen(false)} groupId={id} />
        </div>
        </AssetProvider>
      )}
    </>
  );
}
