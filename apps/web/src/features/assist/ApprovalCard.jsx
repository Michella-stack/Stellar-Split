import { useState } from 'react';
import { assist } from '../../client/api.js';
import { AgentAvatar } from '../../components/Avatar.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { useT } from '../../hooks/useT.js';
import { useToast } from '../../hooks/useToast.js';
import { formatUsd } from '../../lib/format.js';
import { activityText } from './activityText.js';

/**
 * A payment the agent wants to make that is above the owner's "ask me first" limit.
 * @param {{ approval: any, recipientName: string, approvalAbove: string, onDecided?: (status: string) => void }} props
 */
export function ApprovalCard({ approval, recipientName, approvalAbove, onDecided }) {
  const { t } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(/** @type {'approve' | 'reject' | null} */ (null));
  const [decided, setDecided] = useState(approval.status !== 'pending' ? approval.status : null);

  async function decide(kind) {
    setBusy(kind);
    try {
      const result = await (kind === 'approve' ? assist.approve(approval.id) : assist.reject(approval.id));
      setDecided(result.approval.status);
      toast(kind === 'approve' ? t('agent.approval.approvedToast', { name: recipientName, amount: formatUsd(approval.amount) }) : t('agent.approval.declinedToast'), {
        tone: kind === 'approve' ? 'success' : 'info',
      });
      onDecided?.(result.approval.status);
    } catch (e) {
      toast(e?.status === 409 ? t('agent.approval.alreadyDecided') : t('agent.approval.sendError'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card tone="outline" as="section" aria-label={t('agent.approval.title')} className="flex flex-col gap-4 border-2 border-text">
      <div className="flex items-center gap-3">
        <AgentAvatar />
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide">{t('agent.approval.title')}</span>
          <span className="text-sm text-muted">{t('agent.approval.above', { amount: formatUsd(approvalAbove) })}</span>
        </div>
      </div>
      <p className="text-lg">
        {t('agent.approval.pay', { name: recipientName, amount: formatUsd(approval.amount) })}
        <span className="block text-base text-muted">{activityText(t, approval, () => recipientName)}</span>
      </p>
      {decided ? (
        <p role="status" className="font-semibold">
          {decided === 'approved' ? t('agent.approval.youApproved') : decided === 'rejected' ? t('agent.approval.youDeclined') : t('agent.approval.stateOther', { status: decided })}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" loading={busy === 'reject'} disabled={busy !== null} onClick={() => decide('reject')}>
            {t('agent.approval.decline')}
          </Button>
          <Button loading={busy === 'approve'} disabled={busy !== null} onClick={() => decide('approve')}>
            {t('agent.approval.approve')}
          </Button>
        </div>
      )}
    </Card>
  );
}
