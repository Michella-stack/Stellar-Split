import { Link } from 'react-router';
import { listGroups } from '../client/api.js';
import { Amount } from '../components/Amount.jsx';
import { ButtonLink } from '../components/Button.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { IconChevronRight, IconPlus, IconUsers } from '../components/icons.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { GroupTypePill } from '../features/groups/GroupTypePill.jsx';
import { useApi } from '../hooks/useApi.js';
import { useT } from '../hooks/useT.js';
import { useWallet } from '../hooks/useWallet.js';
import { ASSETS } from '../lib/asset.js';
import { signOf } from '../lib/format.js';
import { useEstimate } from '../hooks/useRates.js';

export default function Groups() {
  const { t } = useT();
  const { profile } = useWallet();
  const { data, error, loading, reload } = useApi(listGroups, 'groups');

  return (
    <>
      <TopBar />
      <div className="flex flex-col gap-6 pb-8">
        <h1 className="font-display-wide text-4xl">{t('groups.title')}</h1>
        {loading && <Loading label={t('groups.loading')} />}
        {error && <LoadError title={t('groups.loadError')} error={error} onRetry={reload} />}
        {data && (
          <>
            {data.groups.length > 0 && <Summary totals={data.totals} homeCurrency={profile?.homeCurrency} />}
            {(data.otherTotals ?? []).map((other) => (
              <OtherSummary key={other.asset} totals={other} />
            ))}
            {data.groups.length === 0 ? (
              <EmptyState
                icon={<IconUsers />}
                title={t('groups.emptyTitle')}
                action={
                  <ButtonLink to="/groups/new" icon={<IconPlus size={20} />}>
                    {t('groups.new')}
                  </ButtonLink>
                }
              >
                {t('groups.emptyBody')}
              </EmptyState>
            ) : (
              <>
                <ul className="flex flex-col gap-3">
                  {data.groups.map((g) => (
                    <li key={g.id}>
                      <GroupCard group={g} />
                    </li>
                  ))}
                </ul>
                <ButtonLink to="/groups/new" block icon={<IconPlus size={20} />}>
                  {t('groups.new')}
                </ButtonLink>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** @param {{ totals: { youOwe: string, youAreOwed: string }, homeCurrency?: string | null }} props */
function Summary({ totals, homeCurrency }) {
  const { t } = useT();
  const estimate = useEstimate();
  const est = (v) => (homeCurrency && signOf(v) !== 0 ? (estimate(v, homeCurrency) ?? undefined) : undefined);
  return (
    <section aria-label={t('groups.acrossAll')} className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1 rounded-card border-2 border-owe/40 bg-owe/10 p-4">
        <span className="text-sm font-semibold">{t('groups.youOwe')}</span>
        <Amount value={totals.youOwe} size="md" tone={signOf(totals.youOwe) ? 'owe' : 'default'} estimate={est(totals.youOwe)} />
      </div>
      <div className="flex flex-col gap-1 rounded-card border-2 border-owed/40 bg-owed/10 p-4">
        <span className="text-sm font-semibold">{t('groups.youAreOwed')}</span>
        <Amount value={totals.youAreOwed} size="md" tone={signOf(totals.youAreOwed) ? 'owed' : 'default'} estimate={est(totals.youAreOwed)} />
      </div>
    </section>
  );
}

/**
 * Totals of groups that settle in another asset (euros), kept apart from the dollar totals.
 * @param {{ totals: { asset: string, youOwe: string, youAreOwed: string } }} props
 */
function OtherSummary({ totals }) {
  const { t } = useT();
  const label = ASSETS[totals.asset]?.label ?? totals.asset;
  return (
    <section aria-label={`${label}: ${t('groups.acrossAll')}`} className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1 rounded-card border-2 border-owe/40 bg-owe/10 p-4">
        <span className="text-sm font-semibold">
          {t('groups.youOwe')} · {totals.asset}
        </span>
        <Amount value={totals.youOwe} asset={totals.asset} size="md" tone={signOf(totals.youOwe) ? 'owe' : 'default'} />
      </div>
      <div className="flex flex-col gap-1 rounded-card border-2 border-owed/40 bg-owed/10 p-4">
        <span className="text-sm font-semibold">
          {t('groups.youAreOwed')} · {totals.asset}
        </span>
        <Amount value={totals.youAreOwed} asset={totals.asset} size="md" tone={signOf(totals.youAreOwed) ? 'owed' : 'default'} />
      </div>
    </section>
  );
}

/** @param {{ group: any }} props */
function GroupCard({ group }) {
  const { t } = useT();
  const sign = signOf(group.myNet);
  return (
    <Link to={`/groups/${group.id}`} className="flex items-center gap-4 rounded-card bg-surface p-5 hover:bg-surface-2">
      <Avatar name={group.name} id={group.id} size="lg" className="rounded-[20px]" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-lg font-semibold">{group.name}</span>
        <span className="flex items-center gap-2 text-sm text-muted">
          <GroupTypePill type={group.type} />
          {t('groups.members', { count: group.memberCount })}
          {group.asset && group.asset !== 'USDC' && <span className="font-mono">{group.asset}</span>}
        </span>
      </span>
      <span className="flex flex-col items-end">
        {sign === 0 ? (
          <span className="text-sm text-muted">{t('groups.allSquare')}</span>
        ) : (
          <>
            <span className="text-sm text-muted">{sign < 0 ? t('groups.cardOwe') : t('groups.cardOwed')}</span>
            <Amount value={group.myNet} asset={group.asset} size="sm" tone={sign < 0 ? 'owe' : 'owed'} />
          </>
        )}
      </span>
      <IconChevronRight size={18} className="text-muted" />
    </Link>
  );
}
