import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { toStroops, validateAmount } from '@shared/money.js';
import { cancelSettlementIntent, createSettlementIntent, getGroup, recordSettlement } from '../client/api.js';
import { buildUsdcPayment, buildUsdcTrustline, checkPayment, loadBalances, submitSigned, usdcAsset } from '../client/stellar.js';
import { AddressLink } from '../components/AddressLink.jsx';
import { Amount } from '../components/Amount.jsx';
import { Button, ButtonLink } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { IconChevronRight, IconExternal } from '../components/icons.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { MemberAvatar } from '../features/balances/MemberAvatar.jsx';
import { AmountInput } from '../features/expenses/AmountInput.jsx';
import { PaidCard } from '../features/settlement/PaidCard.jsx';
import { PaymentProblem } from '../features/settlement/PaymentProblem.jsx';
import { queueAfter } from '../features/settlement/queue.js';
import { useApi } from '../hooks/useApi.js';
import { DEMO } from '../lib/demoMode.js';
import { useToast } from '../hooks/useToast.js';
import { useWallet } from '../hooks/useWallet.js';
import { formatUsd } from '../lib/format.js';
import { USDC_FAUCET_URL } from '../config/env.js';
import { useEstimate } from '../hooks/useRates.js';

export default function Settle() {
  const { id, memberId } = useParams();
  const location = useLocation();
  // Reloaded for every payment, so a "Settle all" queue always shows what is owed now.
  const group = useApi(() => getGroup(id), `settle:${id}:${memberId}:${location.key}`);
  return (
    <>
      {group.loading && (
        <>
          <TopBar backTo={`/groups/${id}`} title="Settle up" />
          <Loading label="Loading payment" />
        </>
      )}
      {group.error && (
        <>
          <TopBar backTo={`/groups/${id}`} title="Settle up" />
          <LoadError title="Could not load this group" error={group.error} onRetry={group.reload} />
        </>
      )}
      {group.data && <SettleFlow detail={group.data} memberId={memberId} queue={location.state?.queue} />}
    </>
  );
}

/**
 * review → checking → signing (Freighter open) → submitting → paid | problem.
 * A wallet account or network change (epoch) at any point before submission sends the person back to review.
 * @param {{ detail: any, memberId: string }} props
 */
function SettleFlow({ detail, memberId, queue }) {
  const wallet = useWallet();
  const toast = useToast();
  const { group, members, me, myPosition } = detail;
  const recipient = members.find((m) => m.id === memberId);
  const debt = myPosition.owes.find((t) => t.to === memberId)?.amount ?? null;

  const [step, setStep] = useState(/** @type {'review' | 'checking' | 'signing' | 'submitting' | 'paid' | 'problem'} */ ('review'));
  const [amount, setAmount] = useState(debt ?? '');
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState(/** @type {{ code: string, txHash?: string } | null} */ (null));
  const [paid, setPaid] = useState(/** @type {{ hash: string, amount: string } | null} */ (null));
  const [record, setRecord] = useState(/** @type {'saving' | 'saved' | 'failed' | 'review'} */ ('saving'));
  const [paidIntent, setPaidIntent] = useState(/** @type {string | null} */ (null));
  const [addingTrustline, setAddingTrustline] = useState(false);
  const [notice, setNotice] = useState(/** @type {string | null} */ (null));
  const reviewedEpoch = useRef(wallet.epoch);
  const [balanceVersion, setBalanceVersion] = useState(0);
  const balances = useApi(
    () => (wallet.address ? loadBalances(wallet.address) : Promise.resolve(null)),
    `balances:${wallet.address}:${wallet.epoch}:${balanceVersion}`,
  );

  // Account or network changed after review: the pending payment is no longer valid.
  useEffect(() => {
    if (wallet.epoch === reviewedEpoch.current) return;
    reviewedEpoch.current = wallet.epoch;
    if (step === 'paid' || step === 'submitting') return;
    // Reacting to an external wallet change is what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep('review');
    setNotice('Your Freighter account or network changed. Check the details and confirm again.');
  }, [wallet.epoch, step]);

  const check = validateAmount(amount, debt ? { max: toStroops(debt) } : {});
  const amountError = !check.ok
    ? { INVALID_FORMAT: 'Enter an amount like 12.50.', TOO_MANY_DECIMALS: 'Use at most 7 decimal places.', NOT_POSITIVE: 'The amount must be more than zero.', EXCEEDS_LIMIT: `You only owe ${debt ? formatUsd(debt) : ''}.` }[check.code]
    : null;
  const estimate = useEstimate();
  const myCurrency = wallet.profile?.homeCurrency;
  const leavesYou = check.ok && myCurrency ? estimate(amount, myCurrency) : null;
  const theyGet = check.ok && recipient?.homeCurrency ? estimate(amount, recipient.homeCurrency) : null;

  function fail(error) {
    setProblem({ code: error?.code ?? 'UNKNOWN', txHash: error?.txHash });
    setStep('problem');
  }

  async function saveRecord(hash, intentId) {
    setRecord('saving');
    try {
      await recordSettlement(group.id, { intentId, txHash: hash });
      setRecord('saved');
    } catch (error) {
      // NEEDS_REVIEW: paid on Stellar, but the debt changed or the reservation lapsed. The API keeps the hash.
      setRecord(error?.code === 'NEEDS_REVIEW' ? 'review' : 'failed');
    }
  }

  /** Frees the reservation when nothing was sent, so the creditor is not blocked for 10 minutes. */
  function release(intentId) {
    if (!intentId) return;
    // One retry: a cancel lost to a network blip would otherwise block both people for the full 10 minutes.
    cancelSettlementIntent(group.id, intentId).catch(() => cancelSettlementIntent(group.id, intentId).catch(() => {}));
  }

  async function confirm() {
    if (!check.ok || !wallet.address) return;
    setNotice(null);
    const from = wallet.address;
    const intentEpoch = wallet.epoch;
    let intentId = null;
    let submitted = false;
    let reserving = false;
    if (DEMO) return confirmDemo();
    try {
      setStep('checking');
      await checkPayment({ from, to: recipient.address, amount });
      // Step 1: reserve the payment with the API. It returns the reference (memo) the payment must carry.
      reserving = true;
      const { intent } = await createSettlementIntent(group.id, { to: recipient.id, amount });
      reserving = false;
      intentId = intent.id;
      if (intent.payTo !== recipient.address || toStroops(intent.amount) !== toStroops(amount)) {
        throw Object.assign(new Error('The reservation does not match what you reviewed'), { code: 'INTENT_MISMATCH' });
      }
      const { xdr } = await buildUsdcPayment({ from, to: intent.payTo, amount: intent.amount, memoHash: intent.memo.value, notAfter: intent.expiresAt });
      setStep('signing');
      const asset = usdcAsset();
      const { signedXdr } = await wallet.sign(xdr, {
        kind: 'payment',
        signer: from,
        destination: recipient.address,
        amount,
        assetCode: asset.getCode(),
        assetIssuer: asset.getIssuer(),
        memoHash: intent.memo.value,
        notAfter: intent.expiresAt,
      });
      if (reviewedEpoch.current !== intentEpoch) {
        release(intentId); // wallet changed while Freighter was open
        return;
      }
      setStep('submitting');
      submitted = true;
      const result = await submitSigned(signedXdr);
      setPaid({ hash: result.hash, amount });
      setBalanceVersion((v) => v + 1);
      setStep('paid');
      // Step 2: record it. The API checks the memo and time bounds on Horizon before accepting it.
      setPaidIntent(intentId);
      saveRecord(result.hash, intentId);
    } catch (error) {
      // Before submission nothing moved, so the reservation can go. After a submission whose outcome is
      // unknown (timeout, lost connection) it stays: the payment may still land and match it.
      const outcomeUnknown = submitted && (error?.code === 'TIMEOUT' || error?.code === 'NETWORK');
      if (!outcomeUnknown) release(intentId);
      // The reservation may exist, but its id never arrived, so it cannot be cancelled: it expires by itself.
      const lostReply = reserving && (error?.code === 'TIMEOUT' || error?.code === 'NETWORK');
      fail(lostReply ? { code: 'RESERVATION_UNCONFIRMED' } : error);
    }
  }

  /** Demo mode: the same steps and screens, but nothing is signed or sent. */
  async function confirmDemo() {
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
      setStep('checking');
      await pause(500);
      const { intent } = await createSettlementIntent(group.id, { to: recipient.id, amount });
      setStep('signing');
      await pause(900);
      setStep('submitting');
      await pause(700);
      const hash = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
      setPaid({ hash, amount });
      setPaidIntent(intent.id);
      setStep('paid');
      await saveRecord(hash, intent.id);
    } catch (error) {
      fail(error);
    }
  }

  async function addTrustline() {
    setAddingTrustline(true);
    try {
      const { xdr } = await buildUsdcTrustline(wallet.address);
      const asset = usdcAsset();
      const { signedXdr } = await wallet.sign(xdr, { kind: 'trustline', signer: wallet.address, assetCode: asset.getCode(), assetIssuer: asset.getIssuer() });
      await submitSigned(signedXdr);
      toast('USDC trustline added. Get testnet USDC from the faucet, then pay.', { tone: 'success' });
      setBalanceVersion((v) => v + 1);
      setProblem(null);
      setStep('review');
    } catch (error) {
      fail(error);
    } finally {
      setAddingTrustline(false);
    }
  }

  if (!recipient) {
    return (
      <>
        <TopBar backTo={`/groups/${group.id}`} title="Settle up" />
        <LoadError title="This person is not in the group" error={{ code: 'NOT_FOUND' }} />
      </>
    );
  }

  // "Settle all": who is left to pay after this one.
  const remaining = queueAfter(queue, memberId);
  const nextMember = remaining.length > 0 ? members.find((m) => m.id === remaining[0]) : null;
  const nextPayment = nextMember
    ? { memberId: nextMember.id, name: nextMember.displayName, queue, done: queue.indexOf(memberId) + 1, total: queue.length }
    : null;

  if (step === 'paid' && paid) {
    return (
      <>
        <TopBar backTo={`/groups/${group.id}`} title="Paid" />
        <PaidCard
          amount={paid.amount}
          recipientName={recipient.displayName}
          recipientAddress={recipient.address}
          groupId={group.id}
          groupName={group.name}
          txHash={paid.hash}
          fullyPaid={debt !== null && toStroops(paid.amount) === toStroops(debt)}
          record={{ status: record, retry: () => saveRecord(paid.hash, paidIntent) }}
          next={nextPayment}
        />
      </>
    );
  }

  if (step === 'problem' && problem) {
    return (
      <>
        <TopBar backTo={`/groups/${group.id}`} title="Payment problem" />
        <PaymentProblem
          code={problem.code}
          txHash={problem.txHash}
          groupId={group.id}
          onReview={() => {
            if (problem.code === 'INSUFFICIENT_BALANCE') setEditing(true);
            setStep('review');
          }}
          onAddTrustline={addTrustline}
          addingTrustline={addingTrustline}
        />
      </>
    );
  }

  if (!debt) {
    return (
      <>
        <TopBar backTo={`/groups/${group.id}`} title="Settle up" />
        <Card tone="accent" className="my-6 flex flex-col gap-3">
          <h1 className="font-display-wide text-3xl">Nothing to pay</h1>
          <p>You don’t owe {recipient.displayName} anything in {group.name} right now.</p>
          <ButtonLink to={`/groups/${group.id}`} variant="onAccent">
            Back to group
          </ButtonLink>
        </Card>
      </>
    );
  }

  const busy = step === 'checking' || step === 'signing' || step === 'submitting';
  const available = availability(balances.data, check.ok ? amount : null, debt);
  const busyLabel = {
    checking: 'Checking balances…',
    signing: DEMO ? 'Confirming (demo)…' : 'Confirm in Freighter…',
    submitting: DEMO ? 'Sending (demo)…' : 'Sending to Stellar…',
  }[step];
  const myMember = members.find((m) => m.id === me);

  return (
    <>
      <TopBar backTo={`/groups/${group.id}`} title="Review payment" />
      <div className="flex flex-col gap-6 pt-2 pb-8">
        <h1 className="sr-only">Review your payment to {recipient.displayName}</h1>
        {notice && (
          <p role="alert" className="rounded-2xl border-2 border-owe px-4 py-3 font-medium">
            {notice}
          </p>
        )}

        <div className="flex items-center justify-center gap-4" aria-hidden="true">
          <MemberAvatar member={myMember} size="lg" />
          <IconChevronRight className="text-muted" />
          <MemberAvatar member={recipient} size="lg" />
        </div>
        <p className="text-center text-lg">
          You → <span className="font-semibold">{recipient.displayName}</span>
        </p>

        {editing ? (
          <AmountInput value={amount} onChange={setAmount} error={amountError} label={`Amount to pay (you owe ${formatUsd(debt)})`} />
        ) : (
          <div className="flex flex-col items-center gap-1 text-center">
            <Amount value={amount} size="xl" />
            <span className="font-mono text-sm text-muted">USDC</span>
          </div>
        )}

        <AvailableBalance
          state={balances.loading ? { kind: 'loading' } : balances.error ? { kind: 'error' } : available}
          recipientName={recipient.displayName}
          onPayWhatIHave={(value) => {
            setEditing(true);
            setAmount(value);
          }}
          onRetry={balances.reload}
        />

        <ul className="flex flex-col gap-1 text-center">
          {leavesYou && <li>Leaves you ≈ {leavesYou} <span className="text-muted">estimate</span></li>}
          {theyGet && (
            <li>
              {recipient.displayName} can cash out ≈ {theyGet} <span className="text-muted">estimate</span>
            </li>
          )}
        </ul>

        <Card as="section" aria-label="Payment details">
          <dl className="flex flex-col divide-y divide-line">
            <Row term="To">
              <span className="flex flex-col items-end">
                <span className="font-semibold">{recipient.displayName}</span>
                <AddressLink address={recipient.address} className="text-sm text-muted" />
              </span>
            </Row>
            <Row term="Group">{group.name}</Row>
            <Row term="Asset">
              <span className="font-mono">USDC</span>
            </Row>
            <Row term="Network">Stellar Testnet</Row>
            <Row term="Fee">Less than $0.01</Row>
          </dl>
        </Card>

        <div className="flex flex-col gap-3" aria-live="polite">
          <Button block loading={busy} disabled={!check.ok || busy || available.blocking} onClick={confirm}>
            {busy ? busyLabel : DEMO ? 'Confirm payment (demo)' : 'Confirm in Freighter'}
          </Button>
          {!editing && (
            <Button block variant="outline" disabled={busy} onClick={() => setEditing(true)}>
              Pay a different amount
            </Button>
          )}
        </div>
        <p className="text-center text-sm text-muted">
          {DEMO
            ? `Demo: this payment is simulated and nothing is sent to Stellar. In the real app, Freighter shows these same details before you approve and the money goes straight to ${recipient.displayName}.`
            : `Freighter will show these same details before you approve. Money goes straight to ${recipient.displayName}; Stellar Split never holds it.`}
        </p>
      </div>
    </>
  );
}

/**
 * What the payer's balances mean for this payment. Only "blocking" states disable Confirm; the full check
 * runs again right before Freighter opens.
 * @param {any} balances result of loadBalances, or null
 * @param {string | null} amount valid amount or null
 * @param {string} debt
 */
function availability(balances, amount, debt) {
  if (!balances) return { kind: 'unknown', blocking: false };
  if (!balances.funded) return { kind: 'not-funded', blocking: true };
  if (balances.usdc === null) return { kind: 'no-trustline', blocking: false };
  const have = toStroops(balances.usdc);
  const max = have < toStroops(debt) ? balances.usdc : debt;
  if (amount && toStroops(amount) > have) return { kind: 'short', usdc: balances.usdc, max, blocking: true };
  return { kind: 'ok', usdc: balances.usdc, blocking: false };
}

/** @param {{ state: any, recipientName: string, onPayWhatIHave: (amount: string) => void, onRetry: () => void }} props */
function AvailableBalance({ state, recipientName, onPayWhatIHave, onRetry }) {
  const box = 'rounded-2xl px-4 py-3 text-center';
  if (state.kind === 'loading') {
    return (
      <p role="status" className={`${box} bg-surface text-muted`}>
        Checking your balance…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p className={`${box} bg-surface`}>
        Could not read your balance.{' '}
        <button type="button" onClick={onRetry} className="min-h-11 font-semibold underline">
          Try again
        </button>
      </p>
    );
  }
  if (state.kind === 'not-funded') {
    return (
      <p role="alert" className={`${box} border-2 border-owe`}>
        Your wallet isn’t on Testnet yet. Fund it from the{' '}
        <Link to="/wallet" className="font-semibold underline">
          Wallet screen
        </Link>
        .
      </p>
    );
  }
  if (state.kind === 'no-trustline') {
    return (
      <p className={`${box} bg-surface`}>
        <span className="font-semibold">Available: no USDC yet.</span> Your wallet needs a USDC trustline; you can add it when you confirm.
      </p>
    );
  }
  if (state.kind === 'short') {
    return (
      <div role="alert" className={`${box} flex flex-col items-center gap-2 border-2 border-owe`}>
        <p>
          <span className="font-semibold">Not enough USDC.</span> You have {formatUsd(state.usdc)} available.
        </p>
        {toStroops(state.max) > 0n ? (
          <Button variant="secondary" onClick={() => onPayWhatIHave(state.max)}>
            Pay {formatUsd(state.max)} to {recipientName} instead
          </Button>
        ) : (
          <a href={USDC_FAUCET_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold underline">
            Get testnet USDC <IconExternal size={16} />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    );
  }
  if (state.kind === 'ok') {
    return (
      <p className={`${box} bg-surface`}>
        Available: <span className="font-semibold tabular-nums">{formatUsd(state.usdc)}</span> <span className="font-mono text-sm text-muted">USDC</span>
      </p>
    );
  }
  return null;
}

/** @param {{ term: string, children: import('react').ReactNode }} props */
function Row({ term, children }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-2">
      <dt className="text-muted">{term}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
