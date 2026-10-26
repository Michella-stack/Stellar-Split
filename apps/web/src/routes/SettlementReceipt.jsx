import { useParams } from 'react-router';
import { getGroup, listActivity } from '../client/api.js';
import { AssetProvider } from '../components/AssetProvider.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { PaidCard } from '../features/settlement/PaidCard.jsx';
import { useApi } from '../hooks/useApi.js';
import { useT } from '../hooks/useT.js';
import { memberName } from '../lib/format.js';

/** A payment that was already recorded, opened again from Activity. */
export default function SettlementReceipt() {
  const { t } = useT();
  const { id, settlementId } = useParams();
  const group = useApi(() => getGroup(id), `group:${id}`);
  const activity = useApi(() => listActivity(id), `activity:${id}`);
  const error = group.error ?? activity.error;
  const reload = () => {
    group.reload();
    activity.reload();
  };

  const detail = group.data;
  const item = activity.data?.items.find((entry) => entry.type === 'settlement' && entry.id === settlementId);
  const byId = new Map((detail?.members ?? []).map((m) => [m.id, m]));
  const recipient = item ? byId.get(item.to) : null;

  let body;
  if (error) body = <LoadError title={t('payment.loadError')} error={error} onRetry={reload} />;
  else if (!detail || !activity.data) body = <Loading label={t('payment.loading')} />;
  else if (!item || !recipient) body = <LoadError title={t('payment.notFound')} error={{ code: 'NOT_FOUND' }} />;
  else {
    const from = memberName(byId.get(item.from), detail.me);
    const to = memberName(recipient, detail.me);
    const youPaid = item.from === detail.me;
    body = (
      <AssetProvider group={detail.group}>
        <PaidCard
          amount={item.amount}
          recipientName={recipient.displayName}
          recipientAddress={recipient.address}
          groupId={detail.group.id}
          groupName={detail.group.name}
          txHash={item.txHash}
          fullyPaid={false}
          record={{ status: 'saved', retry: () => {} }}
          history={{
            title: t('paid.sent'),
            body: youPaid ? t('payment.youPaid', { to, group: detail.group.name }) : t('payment.paid', { from, to, group: detail.group.name }),
            paidAt: new Date(item.createdAt),
          }}
        />
      </AssetProvider>
    );
  }

  return (
    <>
      <TopBar backTo={`/groups/${id}/activity`} title={t('paid.title')} />
      {body}
    </>
  );
}
