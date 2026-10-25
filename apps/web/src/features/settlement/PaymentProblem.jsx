import { Button, ButtonLink } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { IconAlert, IconExternal } from '../../components/icons.jsx';
import { EXPLORER_TX_URL, USDC_FAUCET_URL } from '../../config/env.js';
import { useT } from '../../hooks/useT.js';

// Every code has pp.<CODE>.title and pp.<CODE>.body in i18n/messages. A code without texts falls back to UNKNOWN.
const CODES = [
  'USER_REJECTED', 'INSUFFICIENT_BALANCE', 'NO_TRUSTLINE', 'NOT_FUNDED', 'LOW_XLM', 'RECIPIENT_NOT_READY', 'SAME_ACCOUNT',
  'EXPIRED', 'NETWORK', 'TIMEOUT', 'REJECTED_BY_NETWORK', 'WRONG_NETWORK', 'ACCOUNT_CHANGED', 'LOCKED', 'INTENT_MISMATCH',
  'INTENT_IN_PROGRESS', 'RESERVATION_UNCONFIRMED', 'OVERPAY', 'UPSTREAM_UNAVAILABLE', 'NOT_INSTALLED', 'UNKNOWN',
];
// Codes where the payment may have gone through, so the person checks the explorer instead of paying again.

/**
 * @param {{ code: string, txHash?: string, groupId: string, onReview: () => void, onAddTrustline?: () => void,
 *   addingTrustline?: boolean, asset?: string }} props
 */
export function PaymentProblem({ code, txHash, groupId, onReview, onAddTrustline, addingTrustline, asset = 'USDC' }) {
  const { t } = useT();
  const key = CODES.includes(code) ? code : 'UNKNOWN';
  const unknownOutcome = code === 'TIMEOUT' || (code === 'NETWORK' && txHash);
  const body = code === 'NETWORK' && txHash ? t('pp.NETWORK.unknownBody') : t(`pp.${key}.body`, { asset });

  return (
    <div className="flex flex-col gap-6 py-4">
      <Card tone="outline" role="alert" className="flex flex-col gap-3">
        <span className="text-owe">
          <IconAlert size={28} />
        </span>
        <h1 className="font-display-wide text-3xl">{t(`pp.${key}.title`, { asset })}</h1>
        <p className="text-muted">{body}</p>
      </Card>

      {unknownOutcome && txHash && (
        <a
          href={`${EXPLORER_TX_URL}${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-on-primary"
        >
          {t('pp.checkExpert')} <IconExternal size={18} />
          <span className="sr-only">{t('common.opensNewTab')}</span>
        </a>
      )}
      {code === 'NO_TRUSTLINE' && onAddTrustline && (
        <Button block loading={addingTrustline} onClick={onAddTrustline}>
          {t('pp.addTrustline', { asset })}
        </Button>
      )}
      {code === 'INSUFFICIENT_BALANCE' && (
        <a href={USDC_FAUCET_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1 font-medium underline underline-offset-4">
          {t('walletScreen.getUsdc', { asset })} <IconExternal size={16} />
          <span className="sr-only">{t('common.opensNewTab')}</span>
        </a>
      )}
      {(code === 'NOT_FUNDED' || code === 'LOW_XLM') && (
        <ButtonLink to="/wallet" block>
          {t('pp.openWallet')}
        </ButtonLink>
      )}
      {!unknownOutcome && code !== 'SAME_ACCOUNT' && code !== 'NOT_FUNDED' && code !== 'LOW_XLM' && (
        <Button block variant={code === 'NO_TRUSTLINE' ? 'outline' : 'primary'} onClick={onReview}>
          {code === 'INSUFFICIENT_BALANCE' ? t('settle.differentAmount') : t('pp.backToReview')}
        </Button>
      )}
      <ButtonLink to={`/groups/${groupId}`} variant="ghost" block>
        {t('settle.backToGroup')}
      </ButtonLink>
    </div>
  );
}
