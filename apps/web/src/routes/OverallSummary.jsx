import { useState } from 'react';
import { Link } from 'react-router';
import { currencyOfAsset } from '@shared/currency.js';
import { fromStroops } from '@shared/money.js';
import { getGroup, listExpenses, listGroups } from '../client/api.js';
import { Card } from '../components/Card.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconChevronRight, IconReceipt } from '../components/icons.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { buildBuckets } from '../features/summary/buckets.js';
import { bucketRange } from '../features/summary/labels.js';
import { pool, rangeTotals } from '../features/summary/overall.js';
import { SpendChart } from '../features/summary/SpendChart.jsx';
import { useApi } from '../hooks/useApi.js';
import { useRates } from '../hooks/useRates.js';
import { useT } from '../hooks/useT.js';
import { useWallet } from '../hooks/useWallet.js';
import { assetCodeOf } from '../lib/asset.js';
import { formatMoney } from '../lib/format.js';

/** Every group, with its expenses and the member that is me in it. */
async function loadEverything() {
  const { groups } = await listGroups();
  return Promise.all(
    groups.map(async (g) => {
      const [detail, { expenses }] = await Promise.all([getGroup(g.id), listExpenses(g.id)]);
      return { groupId: g.id, groupName: g.name, currency: currencyOfAsset(assetCodeOf(detail.group)), me: detail.me, expenses };
    }),
  );
}

export default function OverallSummary() {
  const { t } = useT();
  const everything = useApi(loadEverything, 'overall-summary');
  return (
    <>
      <TopBar backTo="/groups" backLabel={t('group.backToGroups')} title={t('overall.title')} />
      <div className="flex flex-col gap-6 pb-8">
        <h1 className="font-display-wide text-4xl">{t('overall.title')}</h1>
        {everything.loading && <Loading label={t('summary.loading')} />}
        {everything.error && <LoadError title={t('summary.loadError')} error={everything.error} onRetry={everything.reload} />}
        {everything.data && <Report loaded={everything.data} />}
      </div>
    </>
  );
}

/** @param {{ loaded: Awaited<ReturnType<typeof loadEverything>> }} props */
function Report({ loaded }) {
  const { t } = useT();
  const { profile } = useWallet();
  const { rates } = useRates();
  const home = profile?.homeCurrency && rates[profile.homeCurrency] ? profile.homeCurrency : 'USD';
  const [measure, setMeasure] = useState(/** @type {'mine' | 'all'} */ ('mine'));
  const [period, setPeriod] = useState(/** @type {'day' | 'week' | 'month'} */ ('month'));
  const [now] = useState(() => new Date());

  if (loaded.every((g) => g.expenses.length === 0)) {
    return (
      <EmptyState icon={<IconReceipt />} title={t('overall.emptyTitle')}>
        {t('overall.emptyBody')}
      </EmptyState>
    );
  }

  const { expenses, converted } = pool(loaded, home, rates);
  const buckets = buildBuckets(expenses, period, now, 'me');
  const shown = buckets.map((b) => ({ ...b, total: measure === 'mine' ? b.mine : b.total }));
  const totals = rangeTotals(expenses, buckets);
  const headline = measure === 'mine' ? totals.mine : totals.total;
  const money = (stroops) => `${converted ? '≈ ' : ''}${formatMoney(fromStroops(stroops), home)}`;
  const rows = totals.perGroup
    .map((row) => ({ ...row, name: loaded.find((g) => g.groupId === row.groupId)?.groupName ?? '', value: measure === 'mine' ? row.mine : row.total }))
    .filter((row) => row.value > 0n)
    .sort((a, b) => (a.value === b.value ? 0 : a.value < b.value ? 1 : -1));
  const biggest = rows[0]?.value ?? 1n;

  return (
    <>
      <Segmented
        label={t('overall.measure')}
        hideLabel
        value={measure}
        onChange={setMeasure}
        options={[
          { value: 'mine', label: t('overall.mine') },
          { value: 'all', label: t('overall.all') },
        ]}
      />
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

      <section aria-labelledby="overall-total" className="flex flex-col gap-1">
        <h2 id="overall-total" className="text-sm font-medium text-muted">
          {t(`overall.${measure}.${period}`)}
        </h2>
        <p className="font-display-wide text-5xl tabular-nums">{money(headline)}</p>
        <p className="text-muted">
          {measure === 'mine'
            ? t('overall.youPaid', { amount: money(totals.paid) })
            : t('overall.yourPart', { amount: money(totals.mine) })}
          {' · '}
          {t(totals.count === 1 ? 'overall.expenseOne' : 'overall.expenses', { count: totals.count })}
        </p>
      </section>

      <Card className="flex flex-col gap-3">
        <SpendChart buckets={shown} period={period} label={t(`summary.chart.${period}`)} currency={home} />
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
              {[...shown].reverse().map((b) => (
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

      <section aria-labelledby="by-group-title" className="flex flex-col gap-3">
        <h2 id="by-group-title" className="text-lg font-semibold">
          {t('overall.byGroup')}
        </h2>
        {rows.length === 0 ? (
          <p className="text-muted">{t('overall.nothingHere')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((row) => (
              <li key={row.groupId}>
                <Link to={`/groups/${row.groupId}/summary`} className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-1 hover:bg-surface-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">{row.name}</span>
                      <span className="font-semibold tabular-nums">{money(row.value)}</span>
                    </div>
                    <div aria-hidden="true" className="h-2 rounded-full bg-surface-2">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(Number((row.value * 1000n) / biggest) / 10, 2)}%` }} />
                    </div>
                  </div>
                  <IconChevronRight size={18} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {converted && <p className="text-sm text-muted">{t('overall.estimateNote', { currency: home })}</p>}
    </>
  );
}
