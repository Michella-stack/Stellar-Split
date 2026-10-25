import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { getAgent, getGroup, listAgentActivity, updateAgent } from '../client/api.js';
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
import { useToast } from '../hooks/useToast.js';
import { formatDate, formatUsd } from '../lib/format.js';

export default function Assist() {
  const [version, setVersion] = useState(0);
  const agent = useApi(() => getAgent('assist'), `agent#${version}`);
  const activity = useApi(() => listAgentActivity('assist'), `agent-activity#${version}`);
  const group = useApi(() => getGroup('casa-alfama'), 'group:casa-alfama');
  const refresh = () => setVersion((v) => v + 1);

  if (agent.data?.agent.status === 'inactive') return <Navigate to="/assist/intro" replace />;

  return (
    <>
      <TopBar />
      {agent.loading && <Loading label="Loading Stellar Assist" />}
      {agent.error && <LoadError title="Could not load Stellar Assist" error={agent.error} onRetry={agent.reload} />}
      {agent.data && <Dashboard data={agent.data} activity={activity} members={group.data?.members ?? []} onChange={refresh} />}
    </>
  );
}

/** @param {{ data: any, activity: any, members: any[], onChange: () => void }} props */
function Dashboard({ data, activity, members, onChange }) {
  const toast = useToast();
  const { agent, pendingApprovals } = data;
  const [toggling, setToggling] = useState(false);
  const nameOf = (id) => members.find((m) => m.id === id)?.displayName ?? 'a member';
  const paused = agent.status === 'paused';
  const spent = Number(agent.spentToday);
  const cap = Number(agent.policy.dailyCap);

  async function togglePause() {
    setToggling(true);
    try {
      await updateAgent(agent.id, { status: paused ? 'active' : 'paused' });
      toast(paused ? 'Stellar Assist resumed' : 'Stellar Assist paused. It will not add or pay anything.', { tone: 'success' });
      onChange();
    } catch {
      toast('Could not change the status. Try again.', { tone: 'error' });
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-center gap-4">
        <AgentAvatar size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className="font-display-wide text-3xl">Stellar Assist</h1>
          <Pill tone={paused ? 'neutral' : 'accent'} className="self-start">
            <span aria-hidden="true" className={paused ? 'size-2 rounded-full bg-muted' : 'size-2 rounded-full bg-on-accent'} />
            {paused ? 'Paused' : 'Active'}
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
            Spent today
          </h2>
          <span className="tabular-nums">
            <strong>{formatUsd(agent.spentToday)}</strong> <span className="text-muted">of {formatUsd(agent.policy.dailyCap)}</span>
          </span>
        </div>
        <Progress label="Spent today against the daily cap" value={spent} max={cap} valueText={`${formatUsd(agent.spentToday)} of ${formatUsd(agent.policy.dailyCap)}`} />
        <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
          <Limit term="Max per payment" value={formatUsd(agent.policy.maxPerPayment)} />
          <Limit term="Ask me first above" value={formatUsd(agent.policy.approvalAbove)} />
          <Limit term="Wallet balance" value={formatUsd(agent.wallet.balance)} />
        </dl>
        <Link to="/assist/setup" className="inline-flex min-h-11 items-center self-start font-medium underline underline-offset-4">
          Edit rules
        </Link>
      </Card>

      <section aria-labelledby="recent-title" className="flex flex-col gap-1">
        <h2 id="recent-title" className="text-lg font-semibold">
          Recent activity
        </h2>
        {activity.loading && <Loading label="Loading activity" />}
        {activity.error && <LoadError title="Could not load activity" error={activity.error} onRetry={activity.reload} />}
        {activity.data && (
          <ul>
            {activity.data.items.map((item) => (
              <li key={item.id}>
                <ActivityRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-3">
        <ButtonLink to="/assist/chat" block icon={<IconRobot size={20} />}>
          Chat with Assist
        </ButtonLink>
        <Button variant="outline" block loading={toggling} onClick={togglePause}>
          {paused ? 'Resume' : 'Pause agent'}
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

const STATUS_WORDS = { done: 'Done', blocked: 'Blocked', pending: 'Waiting for you', approved: 'Approved', rejected: 'Declined' };

/** @param {{ item: any }} props */
function ActivityRow({ item }) {
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
      title={item.description}
      subtitle={item.reason ? `${STATUS_WORDS[item.status]}: ${item.reason}` : `${STATUS_WORDS[item.status] ?? item.status} · ${formatDate(item.createdAt)}`}
      trailing={<span className="font-mono text-sm">{formatUsd(item.amount)}</span>}
    />
  );
}
