import { useState } from 'react';
import { Amount } from '../../components/Amount.jsx';
import { Button, ButtonLink } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { IconButton } from '../../components/IconButton.jsx';
import { IconCopy, IconDownload, IconExternal, IconShare } from '../../components/icons.jsx';
import { EXPLORER_TX_URL } from '../../config/env.js';
import { useCopy } from '../../hooks/useCopy.js';
import { useToast } from '../../hooks/useToast.js';
import { downloadBlob, renderReceiptPng } from './receipt.js';
import { shortAddress } from '../../lib/format.js';

/**
 * Success screen after a confirmed Testnet payment.
 * @param {{ amount: string, recipientName: string, recipientAddress: string, groupId: string, groupName: string, txHash: string,
 *   fullyPaid: boolean, record: { status: 'saving' | 'saved' | 'failed', retry: () => void } }} props
 */
export function PaidCard({ amount, recipientName, recipientAddress, groupId, groupName, txHash, fullyPaid, record }) {
  const copy = useCopy();
  const toast = useToast();
  const [paidAt] = useState(() => new Date());
  const [busy, setBusy] = useState(/** @type {'save' | 'share' | null} */ (null));
  const explorerUrl = `${EXPLORER_TX_URL}${txHash}`;
  const filename = `stellar-split-receipt-${txHash.slice(0, 8)}.png`;

  async function receiptFile() {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d4ff3f';
    const blob = await renderReceiptPng({
      amount,
      fromName: 'You',
      toName: recipientName,
      toAddress: recipientAddress,
      groupName,
      txHash,
      explorerUrl,
      date: paidAt,
      accent,
    });
    return new File([blob], filename, { type: 'image/png' });
  }

  async function save() {
    setBusy('save');
    try {
      downloadBlob(await receiptFile(), filename);
      toast('Receipt saved', { tone: 'success' });
    } catch {
      toast('Could not create the receipt image.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    setBusy('share');
    try {
      const file = await receiptFile();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Stellar Split receipt', text: `Paid ${recipientName} ${amount} USDC. ${explorerUrl}` });
      } else {
        await copy(explorerUrl, 'Transaction link');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') toast('Sharing did not work here. Save the receipt instead.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

  return (
    <div className="flex flex-col gap-6 py-4">
      <Card tone="accent" as="section" aria-labelledby="paid-title" className="flex flex-col gap-3">
        <h1 id="paid-title" className="font-display-wide text-4xl">
          {fullyPaid ? 'All square' : 'Payment sent'}
        </h1>
        <p>{fullyPaid ? `You and ${recipientName} are settled up in ${groupName}.` : `You paid ${recipientName} part of what you owe in ${groupName}.`}</p>
        <Amount value={amount} size="lg" tone="inherit" />
      </Card>

      <Card className="flex flex-col gap-2">
        <span className="text-sm text-muted">Transaction</span>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-lg" title={txHash}>
            {shortAddress(txHash)}
          </span>
          <IconButton label="Copy transaction hash" onClick={() => copy(txHash, 'Transaction hash')}>
            <IconCopy size={20} />
          </IconButton>
        </div>
        <p role="status" className="text-sm text-muted">
          {record.status === 'saving' && 'Saving to the group…'}
          {record.status === 'saved' && 'Saved to the group.'}
          {record.status === 'failed' && (
            <span className="text-owe">
              Paid on Stellar, but not saved to the group yet.{' '}
              <button type="button" onClick={record.retry} className="min-h-11 font-semibold underline">
                Try saving again
              </button>
            </span>
          )}
        </p>
      </Card>

      <a
        href={explorerUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border-2 border-line px-6 font-semibold"
      >
        View on Stellar Expert <IconExternal size={18} />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      <ButtonLink to={`/groups/${groupId}`} block>
        Back to group
      </ButtonLink>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" loading={busy === 'save'} disabled={busy !== null} icon={<IconDownload size={20} />} onClick={save}>
          Save receipt
        </Button>
        <Button variant="secondary" loading={busy === 'share'} disabled={busy !== null} icon={<IconShare size={20} />} onClick={share}>
          {canShareFiles ? 'Share' : 'Copy link'}
        </Button>
      </div>
    </div>
  );
}
