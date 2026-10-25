import { Button, ButtonLink } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { IconAlert, IconExternal } from '../../components/icons.jsx';
import { EXPLORER_TX_URL, USDC_FAUCET_URL } from '../../config/env.js';

/**
 * Copy and next step for every way a payment can fail. `unknownOutcome` codes never offer "try again":
 * the payment may have gone through, so the person checks the explorer first.
 */
const PROBLEMS = {
  USER_REJECTED: { title: 'Payment cancelled', body: 'You closed the request in Freighter. Nothing was sent.' },
  INSUFFICIENT_BALANCE: { title: 'Not enough USDC', body: 'Your wallet does not hold enough testnet USDC for this payment. Pay a smaller amount or get more from the faucet.' },
  NO_TRUSTLINE: { title: 'Your wallet can’t hold USDC yet', body: 'Add a USDC trustline first. It is a one-time approval in Freighter that lets your wallet hold USDC. It moves no money.' },
  NOT_FUNDED: { title: 'Your wallet isn’t on Testnet yet', body: 'Fund it with free test XLM from the Wallet screen, then come back.' },
  LOW_XLM: { title: 'Not enough XLM for the fee', body: 'Stellar needs a tiny amount of XLM to process the payment. Top up with Friendbot from the Wallet screen.' },
  RECIPIENT_NOT_READY: { title: 'They can’t receive USDC yet', body: 'Their wallet needs to exist on Testnet and have a USDC trustline. Ask them to open Stellar Split once and add it.' },
  SAME_ACCOUNT: { title: 'That’s your own wallet', body: 'The recipient uses the same Freighter account as you, so there is nothing to send.' },
  EXPIRED: { title: 'The payment expired', body: 'It waited too long before being sent, so nothing moved. Review it again.' },
  NETWORK: { title: 'We couldn’t reach Stellar', body: 'Check your connection.', unknownBody: 'We lost the connection while sending. Check the transaction before paying again: it may have gone through.' },
  TIMEOUT: { title: 'Still waiting for Stellar', body: 'Stellar did not confirm in time. The payment may still go through. Check the transaction before paying again.' },
  REJECTED_BY_NETWORK: { title: 'Stellar rejected the payment', body: 'Nothing was sent. Review the payment and try again.' },
  WRONG_NETWORK: { title: 'Switch Freighter to Testnet', body: 'Open Freighter, choose “Test Net” at the top, then review the payment again.' },
  ACCOUNT_CHANGED: { title: 'Your Freighter account changed', body: 'Switch back to the account you signed in with, or sign in again, then review the payment.' },
  LOCKED: { title: 'Freighter is locked', body: 'Unlock Freighter, then review the payment again.' },
  INTENT_MISMATCH: { title: 'Payment details didn’t match', body: 'The payment to sign was not the one you reviewed, so we stopped. Nothing was sent. Review it again.' },
  INTENT_IN_PROGRESS: { title: 'Another payment is in progress', body: 'You or this person already have a payment waiting in this group. Wait a minute for it to finish or expire, then try again.' },
  OVERPAY: { title: 'That’s more than you owe', body: 'The group’s balances changed. Go back to the group to see what you owe now.' },
  UPSTREAM_UNAVAILABLE: { title: 'Stellar Split is busy', body: 'We could not reach Stellar or our database just now. Nothing was sent. Try again in a moment.' },
  NOT_INSTALLED: { title: 'Freighter is not available', body: 'Open this page in the browser where Freighter is installed.' },
  UNKNOWN: { title: 'Something went wrong', body: 'Nothing was sent as far as we know. Review the payment and try again.' },
};

/**
 * @param {{ code: string, txHash?: string, groupId: string, onReview: () => void, onAddTrustline?: () => void,
 *   addingTrustline?: boolean }} props
 */
export function PaymentProblem({ code, txHash, groupId, onReview, onAddTrustline, addingTrustline }) {
  const problem = PROBLEMS[code] ?? PROBLEMS.UNKNOWN;
  const unknownOutcome = code === 'TIMEOUT' || (code === 'NETWORK' && txHash);
  const body = code === 'NETWORK' && txHash ? problem.unknownBody : problem.body;

  return (
    <div className="flex flex-col gap-6 py-4">
      <Card tone="outline" role="alert" className="flex flex-col gap-3">
        <span className="text-owe">
          <IconAlert size={28} />
        </span>
        <h1 className="font-display-wide text-3xl">{problem.title}</h1>
        <p className="text-muted">{body}</p>
      </Card>

      {unknownOutcome && txHash && (
        <a
          href={`${EXPLORER_TX_URL}${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-on-primary"
        >
          Check on Stellar Expert <IconExternal size={18} />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
      {code === 'NO_TRUSTLINE' && onAddTrustline && (
        <Button block loading={addingTrustline} onClick={onAddTrustline}>
          Add USDC trustline
        </Button>
      )}
      {code === 'INSUFFICIENT_BALANCE' && (
        <a href={USDC_FAUCET_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1 font-medium underline underline-offset-4">
          Get testnet USDC <IconExternal size={16} />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
      {(code === 'NOT_FUNDED' || code === 'LOW_XLM') && (
        <ButtonLink to="/wallet" block>
          Open Wallet
        </ButtonLink>
      )}
      {!unknownOutcome && code !== 'SAME_ACCOUNT' && code !== 'NOT_FUNDED' && code !== 'LOW_XLM' && (
        <Button block variant={code === 'NO_TRUSTLINE' ? 'outline' : 'primary'} onClick={onReview}>
          {code === 'INSUFFICIENT_BALANCE' ? 'Pay a different amount' : 'Back to review'}
        </Button>
      )}
      <ButtonLink to={`/groups/${groupId}`} variant="ghost" block>
        Back to group
      </ButtonLink>
    </div>
  );
}
