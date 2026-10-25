import { useEffect, useReducer } from 'react';
import { AgentAvatar } from '../../components/Avatar.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
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
    <Card tone="outline" as="section" aria-label="Simulated Telegram check" className="flex flex-col gap-4 border-2 border-dashed border-line">
      <div className="flex items-center gap-3">
        <AgentAvatar />
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide">Telegram check · simulated</span>
          <span className="text-sm text-muted">Not sent to Telegram. No money moves.</span>
        </div>
      </div>

      <p className="rounded-3xl rounded-bl-md bg-surface-2 px-4 py-3 text-base">
        <strong>Stellar Assist</strong>
        <span className="block">
          Pay <strong>{recipientName}</strong> <strong>{formatUsd(approval.amount)}</strong> (test USDC)? Address ends …{addressEnding} (sample).
        </span>
        <span className="block text-sm text-muted">Check level {tier}. Answer within 10 minutes.</span>
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" disabled={!asking} onClick={() => dispatch('cancel')}>
          Cancel
        </Button>
        <Button disabled={!asking} onClick={() => dispatch('confirm')}>
          Confirm
        </Button>
      </div>

      <p role="status" aria-live="polite" className="min-h-6 font-semibold">
        {state === 'confirmed' && 'Checking that this Telegram ID matches your account…'}
        {state === 'cleared' && 'Cleared: the Telegram ID matches. Next your wallet would sign this exact payment.'}
        {isDenied(state) && !isFinished('asked') && 'Denied: nothing was signed and the reason is logged.'}
      </p>
    </Card>
  );
}
