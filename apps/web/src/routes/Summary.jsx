import { useState } from 'react';
import { useParams } from 'react-router';
import { fromStroops } from '@shared/money.js';
import { getGroup, listExpenses } from '../client/api.js';
import { AssetProvider } from '../components/AssetProvider.jsx';
import { Card } from '../components/Card.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconReceipt } from '../components/icons.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { MemberAvatar } from '../features/balances/MemberAvatar.jsx';
import { buildBuckets, paidByMember, totalsOf } from '../features/summary/buckets.js';
import { bucketRange } from '../features/summary/labels.js';
import { SpendChart } from '../features/summary/SpendChart.jsx';
import { useApi } from '../hooks/useApi.js';
import { useT } from '../hooks/useT.js';
import { useAssetCode } from '../lib/asset.js';
import { formatMoney, memberName } from '../lib/format.js';

export default function Summary() {
  const { t } = useT();
  const { id } = useParams();
  const group = useApi(() => getGroup(id), `group:${id}`);
  const expenses = useApi(() => listExpenses(id), `expenses:${id}`);
  const error = group.error ?? expenses.error;
  const reload = () => {
    group.reload();
    expenses.reload();
  };

  return (
    <>
      <TopBar backTo={`/groups/${id}`} title={group.data?.group.name ?? t('summary.title')} />
      <div className="flex flex-col gap-6 pb-8">
        <h1 className="font-display-wide text-4xl">{t('summary.title')}</h1>
        {!error && (!group.data || !expenses.data) && <Loading label={t('summary.loading')} />}
        {error && <LoadError title={t('summary.loadError')} error={error} onRetry={reload} />}
        {group.data && expenses.data && (
          <AssetProvider group={group.data.group}>
            <Report detail={group.data} expenses={expenses.data.expenses} />
          </AssetProvider>
        )}
      </div>
    </>
  );
}

/** @param {{ detail: any, expenses: any[] }} props */
function Report({ detail, expenses }) {
  const { t } = useT();
  const code = useAssetCode();
  const [period, setPeriod] = useState(/** @type {'day' | 'week' | 'month'} */ ('week'));
  // Read once per render: the chart ends at the period that holds "now".
  const [now] = useState(() => new Date());

  if (expenses.length === 0) {
    return (
      <EmptyState icon={<IconReceipt />} title={t('summary.emptyTitle')}>
        {t('summary.emptyBody')}
      </EmptyState>
    );
  }

  const buckets = buildBuckets(expenses, period, now, detail.me);
  const totals = totalsOf(buckets);
  const payers = paidByMember(expenses, buckets);
  const biggest = payers[0]?.total ?? 1n;
  const money = (stroops) => formatMoney(fromStroops(stroops), code);

  return (
    <>
      <Segmented
        label={t('summary.period')}
        hideLabel
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'day', label: t('summary.day') },
          { value: 'week', label: t('summary.week') },
          { value: 'month', label: t('summary.month') },
        ]}
      />

      <section aria-labelledby="spent-title" className="flex flex-col gap-1">
        <h2 id="spent-title" className="text-sm font-medium text-muted">
          {t(`summary.spent.${period}`)}
        </h2>
        <p className="font-display-wide text-5xl tabular-nums">{money(totals.total)}</p>
        <p className="text-muted">{t(totals.count === 1 ? 'summary.yourShareOne' : 'summary.yourShare', { amount: money(totals.mine), count: totals.count })}</p>
      </section>

      <Card className="flex flex-col gap-3">
        <SpendChart buckets={buckets} period={period} label={t(`summary.chart.${period}`)} />
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium underline underline-offset-4">{t('summary.viewTable')}</summary>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="py-1 font-medium">{t('summary.tablePeriod')}</th>
                <th scope="col" className="py-1 text-right font-medium">{t('summary.tableTotal')}</th>
                <th scope="col" className="py-1 text-right font-medium">{t('summary.tableCount')}</th>
              </tr>
            </thead>
            <tbody>
              {[...buckets].reverse().map((b) => (
                <tr key={b.start.getTime()} className="border-t border-line">
                  <th scope="row" className="py-2 text-left font-normal">{bucketRange(b, period)}</th>
                  <td className="py-2 text-right tabular-nums">{money(b.total)}</td>
                  <td className="py-2 text-right tabular-nums">{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <section aria-labelledby="paid-by-title" className="flex flex-col gap-3">
        <h2 id="paid-by-title" className="text-lg font-semibold">
          {t('summary.paidBy')}
        </h2>
        {payers.length === 0 ? (
          <p className="text-muted">{t('summary.nobodyPaid')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {payers.map(({ memberId, total }) => {
              const member = detail.members.find((m) => m.id === memberId);
              return (
                <li key={memberId} className="flex items-center gap-3">
                  {member && <MemberAvatar member={member} size="sm" />}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">{memberName(member, detail.me)}</span>
                      <span className="tabular-nums font-semibold">{money(total)}</span>
                    </div>
                    <div aria-hidden="true" className="h-2 rounded-full bg-surface-2">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(Number((total * 1000n) / biggest) / 10, 2)}%` }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
