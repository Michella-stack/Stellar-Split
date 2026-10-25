import { useState } from 'react';
import { approve, reject } from '../../client/api.js';
import { AgentAvatar } from '../../components/Avatar.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { useToast } from '../../hooks/useToast.js';
import { formatUsd } from '../../lib/format.js';

/**
 * A payment the agent wants to make that is above the owner's "ask me first" limit.
 * @param {{ approval: any, recipientName: string, approvalAbove: string, onDecided?: (status: string) => void }} props
 */
export function ApprovalCard({ approval, recipientName, approvalAbove, onDecided }) {
  const toast = useToast();
  const [busy, setBusy] = useState(/** @type {'approve' | 'reject' | null} */ (null));
  const [decided, setDecided] = useState(approval.status !== 'pending' ? approval.status : null);

  async function decide(kind) {
    setBusy(kind);
    try {
      const result = await (kind === 'approve' ? approve(approval.id) : reject(approval.id));
      setDecided(result.approval.status);
      toast(kind === 'approve' ? `Approved: Stellar Assist pays ${recipientName} ${formatUsd(approval.amount)}` : 'Declined. Nothing was paid.', {
        tone: kind === 'approve' ? 'success' : 'info',
      });
      onDecided?.(result.approval.status);
    } catch (e) {
      toast(e?.status === 409 ? 'This request was already decided.' : 'Could not send your decision. Try again.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card tone="outline" as="section" aria-label="Needs your OK" className="flex flex-col gap-4 border-2 border-text">
      <div className="flex items-center gap-3">
        <AgentAvatar />
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide">Needs your OK</span>
          <span className="text-sm text-muted">Above your {formatUsd(approvalAbove)} ask-me-first limit</span>
        </div>
      </div>
      <p className="text-lg">
        Pay <strong>{recipientName}</strong> <strong>{formatUsd(approval.amount)}</strong>
        <span className="block text-base text-muted">{approval.description}</span>
      </p>
      {decided ? (
        <p role="status" className="font-semibold">
          {decided === 'approved' ? 'You approved this payment.' : decided === 'rejected' ? 'You declined this payment.' : `This request is ${decided}.`}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" loading={busy === 'reject'} disabled={busy !== null} onClick={() => decide('reject')}>
            Decline
          </Button>
          <Button loading={busy === 'approve'} disabled={busy !== null} onClick={() => decide('approve')}>
            Approve
          </Button>
        </div>
      )}
    </Card>
  );
}
