import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { assist } from '../client/api.js';
import { PreviewNote } from '../features/assist/PreviewNote.jsx';
import { AgentAvatar } from '../components/Avatar.jsx';
import { Button, ButtonLink } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { IconAlert, IconCheck, IconReceipt, IconRobot } from '../components/icons.jsx';
import { ListRow } from '../components/ListRow.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { Pill } from '../components/Pill.jsx';
import { Progress } from '../components/Progress.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { ApprovalCard } from '../features/assist/ApprovalCard.jsx';
import { useApi } from '../hooks/useApi.js';
import { useT } from '../hooks/useT.js';
import { useToast } from '../hooks/useToast.js';
import { activityText } from '../features/assist/activityText.js';
import { formatDate, formatUsd } from '../lib/format.js';

export default function Assist() {
  const { t } = useT();
  const [version, setVersion] = useState(0);
  const agent = useApi(() => assist.getAgent('assist'), `agent#${version}`);
  const activity = useApi(() => assist.listAgentActivity('assist'), `agent-activity#${version}`);
  const group = useApi(() => assist.getGroup('casa-alfama'), 'group:casa-alfama');
  const refresh = () => setVersion((v) => v + 1);

  if (agent.data?.agent.status === 'inactive') return <Navigate to="/assist/intro" replace />;

  return (
    <>
      <TopBar />
      {agent.loading && <Loading label={t('agent.loading')} />}
      {agent.error && <LoadError title={t('agent.loadError')} error={agent.error} onRetry={agent.reload} />}
      {agent.data && <Dashboard data={agent.data} activity={activity} members={group.data?.members ?? []} onChange={refresh} />}
    </>
  );
}

/** @param {{ data: any, activity: any, members: any[], onChange: () => void }} props */
function Dashboard({ data, activity, members, onChange }) {
  const { t } = useT();
  const toast = useToast();
  const { agent, pendingApprovals } = data;
  const [toggling, setToggling] = useState(false);
  const nameOf = (id) => members.find((m) => m.id === id)?.displayName ?? t('common.member');
  const paused = agent.status === 'paused';
  const spent = Number(agent.spentToday);
  const cap = Number(agent.policy.dailyCap);

  async function togglePause() {
    setToggling(true);
    try {
      await assist.updateAgent(agent.id, { status: paused ? 'active' : 'paused' });
      toast(paused ? t('agent.resumedToast') : t('agent.pausedToast'), { tone: 'success' });
      onChange();
    } catch {
      toast(t('agent.statusError'), { tone: 'error' });
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PreviewNote />
      <div className="flex items-center gap-4">
        <AgentAvatar size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className="font-display-wide text-3xl">{t('agent.name')}</h1>
          <Pill tone={paused ? 'neutral' : 'accent'} className="self-start">
            <span aria-hidden="true" className={paused ? 'size-2 rounded-full bg-muted' : 'size-2 rounded-full bg-on-accent'} />
            {paused ? t('agent.paused') : t('agent.active')}
          </Pill>
        </div>
      </div>

      {pendingApprovals.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          recipientName={nameOf(approval.to)}
          approvalAbove={agent.policy.approvalAbove}
          onDecided={onChange}
        />
      ))}

      <Card as="section" aria-labelledby="spent-title" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="spent-title" className="font-semibold">
            {t('agent.spentToday')}
          </h2>
          <span className="tabular-nums">
            <strong>{formatUsd(agent.spentToday)}</strong> <span className="text-muted">{t('agent.ofCap', { cap: formatUsd(agent.policy.dailyCap) })}</span>
          </span>
        </div>
        <Progress label={t('agent.spentProgress')} value={spent} max={cap} valueText={t('agent.spentValue', { spent: formatUsd(agent.spentToday), cap: formatUsd(agent.policy.dailyCap) })} />
        <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
          <Limit term={t('agent.maxPerPayment')} value={formatUsd(agent.policy.maxPerPayment)} />
          <Limit term={t('agent.askAbove')} value={formatUsd(agent.policy.approvalAbove)} />
          <Limit term={t('agent.walletBalance')} value={formatUsd(agent.wallet.balance)} />
        </dl>
        <Link to="/assist/setup" className="inline-flex min-h-11 items-center self-start font-medium underline underline-offset-4">
          {t('agent.editRules')}
        </Link>
      </Card>

      <section aria-labelledby="recent-title" className="flex flex-col gap-1">
        <h2 id="recent-title" className="text-lg font-semibold">
          {t('agent.recent')}
        </h2>
        {activity.loading && <Loading label={t('agent.loadingActivity')} />}
        {activity.error && <LoadError title={t('agent.activityError')} error={activity.error} onRetry={activity.reload} />}
        {activity.data && (
          <ul>
            {activity.data.items.map((item) => (
              <li key={item.id}>
                <ActivityRow item={item} nameOf={nameOf} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-3">
        <ButtonLink to="/assist/chat" block icon={<IconRobot size={20} />}>
          {t('agent.chat')}
        </ButtonLink>
        <Button variant="outline" block loading={toggling} onClick={togglePause}>
          {paused ? t('agent.resume') : t('agent.pause')}
        </Button>
      </div>
    </div>
  );
}

/** @param {{ term: string, value: string }} props */
function Limit({ term, value }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted">{term}</dt>
      <dd className="font-mono font-semibold">{value}</dd>
    </div>
  );
}

const STATUSES = ['done', 'blocked', 'pending', 'approved', 'rejected'];

/** @param {{ item: any, nameOf: (id: string) => string }} props */
function ActivityRow({ item, nameOf }) {
  const { t } = useT();
  const status = STATUSES.includes(item.status) ? t(`agent.status.${item.status}`) : item.status;
  const reason = item.reasonCode ? t(`agent.reason.${item.reasonCode}`) : item.reason;
  const Icon = item.kind === 'blocked' ? IconAlert : item.kind === 'expense' ? IconReceipt : IconCheck;
  return (
    <ListRow
      leading={
        <span
          aria-hidden="true"
          className={`flex size-11 shrink-0 items-center justify-center rounded-full ${item.kind === 'blocked' ? 'border-2 border-owe text-owe' : 'bg-surface-2'}`}
        >
          <Icon size={20} />
        </span>
      }
      title={activityText(t, item, nameOf)}
      subtitle={reason ? `${status}: ${reason}` : `${status} · ${formatDate(item.createdAt)}`}
      trailing={<span className="font-mono text-sm">{formatUsd(item.amount)}</span>}
    />
  );
}
