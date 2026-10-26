import { useState } from 'react';
import { Amount } from '../../components/Amount.jsx';
import { Button, ButtonLink } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { IconButton } from '../../components/IconButton.jsx';
import { IconCopy, IconDownload, IconExternal, IconShare } from '../../components/icons.jsx';
import { EXPLORER_TX_URL } from '../../config/env.js';
import { useCopy } from '../../hooks/useCopy.js';
import { useT } from '../../hooks/useT.js';
import { useToast } from '../../hooks/useToast.js';
import { DEMO } from '../../lib/demoMode.js';
import { downloadBlob, renderReceiptPng } from './receipt.js';
import { useAssetCode } from '../../lib/asset.js';
import { formatDate, shortAddress } from '../../lib/format.js';

/**
 * Success screen after a confirmed Testnet payment.
 * @param {{ amount: string, recipientName: string, recipientAddress: string, groupId: string, groupName: string, txHash: string,
 *   fullyPaid: boolean, record: { status: 'saving' | 'saved' | 'failed' | 'review', retry: () => void },
 *   next?: { memberId: string, name: string, queue: string[], done: number, total: number } | null,
 *   history?: { title: string, body: string, paidAt: Date } | null }} props
 *   next: the following payment of a "Settle all" queue
 *   history: set when the card is opened later from Activity. It replaces the headline and body, hides the save status and
 *   the next payment, and sends the back button to Activity. `paidAt` is the date the payment was recorded.
 */
export function PaidCard({ amount, recipientName, recipientAddress, groupId, groupName, txHash, fullyPaid, record, next = null, history = null }) {
  const { t } = useT();
  const code = useAssetCode();
  const copy = useCopy();
  const toast = useToast();
  const [now] = useState(() => new Date());
  const paidAt = history?.paidAt ?? now;
  const [busy, setBusy] = useState(/** @type {'save' | 'share' | null} */ (null));
  const explorerUrl = `${EXPLORER_TX_URL}${txHash}`;
  const filename = `stellar-split-receipt-${txHash.slice(0, 8)}.png`;

  async function receiptFile() {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d4ff3f';
    const blob = await renderReceiptPng({
      amount,
      toName: recipientName,
      toAddress: recipientAddress,
      groupName,
      txHash,
      explorerUrl,
      date: paidAt,
      accent,
      demo: DEMO,
      asset: code,
    });
    return new File([blob], filename, { type: 'image/png' });
  }

  async function save() {
    setBusy('save');
    try {
      downloadBlob(await receiptFile(), filename);
      toast(t('paid.receiptSaved'), { tone: 'success' });
    } catch {
      toast(t('paid.receiptError'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    setBusy('share');
    try {
      const file = await receiptFile();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t('paid.shareTitle'), text: t('paid.shareText', { name: recipientName, amount, url: explorerUrl, asset: code }) });
      } else {
        await copy(DEMO ? t('paid.demoShareText', { name: recipientName, amount, asset: code }) : explorerUrl, DEMO ? 'copied.receiptText' : 'copied.txLink');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') toast(t('paid.shareError'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

  return (
    <div className="flex flex-col gap-6 py-4">
      <Card tone="accent" as="section" aria-labelledby="paid-title" className="flex flex-col gap-3">
        <h1 id="paid-title" className="font-display-wide text-4xl">
          {history ? history.title : fullyPaid ? t('balance.allSquare') : t('paid.sent')}
        </h1>
        <p>
          {history
            ? history.body
            : fullyPaid
              ? t('paid.fullBody', { name: recipientName, group: groupName })
              : t('paid.partialBody', { name: recipientName, group: groupName })}
        </p>
        <Amount value={amount} size="lg" tone="inherit" />
      </Card>

      <Card className="flex flex-col gap-2">
        <span className="text-sm text-muted">{DEMO ? t('paid.demoPayment') : t('paid.transaction')}</span>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-lg" title={txHash}>
            {shortAddress(txHash)}
          </span>
          <IconButton label={t('paid.copyHash')} onClick={() => copy(txHash, 'copied.txHash')}>
            <IconCopy size={20} />
          </IconButton>
        </div>
        {DEMO && <p className="text-sm text-muted">{t('paid.demoNote')}</p>}
        {history ? (
          <p className="text-sm text-muted">{formatDate(paidAt)}</p>
        ) : (
        <p role="status" className="text-sm text-muted">
          {record.status === 'saving' && t('paid.saving')}
          {record.status === 'saved' && t('paid.saved')}
          {record.status === 'review' && (
            <span className="text-owe">{t('paid.review')}</span>
          )}
          {record.status === 'failed' && (
            <span className="text-owe">
              {t('paid.failed')}{' '}
              <button type="button" onClick={record.retry} className="min-h-11 font-semibold underline">
                {t('paid.trySaving')}
              </button>
            </span>
          )}
        </p>
        )}
      </Card>

      {!DEMO && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border-2 border-line px-6 font-semibold"
        >
          {t('common.viewOnExpert')} <IconExternal size={18} />
          <span className="sr-only">{t('common.opensNewTab')}</span>
        </a>
      )}
      {history ? (
        <ButtonLink to={`/groups/${groupId}/activity`} block>
          {t('paid.backToActivity')}
        </ButtonLink>
      ) : next ? (
        <>
          <p role="status" className="text-center text-sm text-muted">
            {t('paid.progress', { done: next.done, total: next.total })}
          </p>
          <ButtonLink to={`/groups/${groupId}/settle/${next.memberId}`} state={{ queue: next.queue }} block>
            {t('paid.next', { name: next.name })}
          </ButtonLink>
          <ButtonLink to={`/groups/${groupId}`} variant="ghost" block>
            {t('paid.stopHere')}
          </ButtonLink>
        </>
      ) : (
        <ButtonLink to={`/groups/${groupId}`} block>
          {t('settle.backToGroup')}
        </ButtonLink>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" loading={busy === 'save'} disabled={busy !== null} icon={<IconDownload size={20} />} onClick={save}>
          {t('paid.saveReceipt')}
        </Button>
        <Button variant="secondary" loading={busy === 'share'} disabled={busy !== null} icon={<IconShare size={20} />} onClick={share}>
          {canShareFiles ? t('paid.share') : t('paid.copyLink')}
        </Button>
      </div>
    </div>
  );
}
