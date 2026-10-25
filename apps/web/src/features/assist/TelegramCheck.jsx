import { useEffect, useReducer } from 'react';
import { AgentAvatar } from '../../components/Avatar.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { useT } from '../../hooks/useT.js';
import { formatUsd } from '../../lib/format.js';
import { checkTier, isDenied, isFinished, nextState } from './telegramCheck.js';

const ID_CHECK_DELAY_MS = 900;

/**
 * What Stellar Assist would send the payer on Telegram for a payment that needs a check, with Confirm and Cancel
 * buttons. SIMULATED: nothing is sent to Telegram and no money moves. It shows the flow so the team can review it
 * and record the demo before the real Telegram callback exists.
 * @param {{ approval: any, recipientName: string, addressEnding?: string }} props
 */
export function TelegramCheck({ approval, recipientName, addressEnding = '7QXZ' }) {
  const { t } = useT();
  const [state, dispatch] = useReducer(nextState, 'asked');
  const tier = checkTier(approval.amount);

  // The server then compares the Telegram ID on the button press with the one bound at sign-up. Simulated as a match.
  useEffect(() => {
    if (state !== 'confirmed') return undefined;
    const timer = setTimeout(() => dispatch('id-match'), ID_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const asking = state === 'asked';

  return (
    <Card tone="outline" as="section" aria-label={t('tg.aria')} className="flex flex-col gap-4 border-2 border-dashed border-line">
      <div className="flex items-center gap-3">
        <AgentAvatar />
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide">{t('tg.title')}</span>
          <span className="text-sm text-muted">{t('tg.notSent')}</span>
        </div>
      </div>

      <p className="rounded-3xl rounded-bl-md bg-surface-2 px-4 py-3 text-base">
        <strong>Stellar Assist</strong>
        <span className="block">
          {t('tg.question', { name: recipientName, amount: formatUsd(approval.amount), ending: addressEnding })}
        </span>
        <span className="block text-sm text-muted">{t('tg.level', { tier })}</span>
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" disabled={!asking} onClick={() => dispatch('cancel')}>
          {t('tg.cancel')}
        </Button>
        <Button disabled={!asking} onClick={() => dispatch('confirm')}>
          {t('tg.confirm')}
        </Button>
      </div>

      <p role="status" aria-live="polite" className="min-h-6 font-semibold">
        {state === 'confirmed' && t('tg.checking')}
        {state === 'cleared' && t('tg.cleared')}
        {isDenied(state) && !isFinished('asked') && t('tg.denied')}
      </p>
    </Card>
  );
}
