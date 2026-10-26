import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { validateAmount } from '@shared/money.js';
import { containsSecretKey } from '@shared/validation.js';
import { createExpense, getGroup } from '../client/api.js';
import { Amount } from '../components/Amount.jsx';
import { AssetProvider } from '../components/AssetProvider.jsx';
import { Button } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { Chip } from '../components/Chip.jsx';
import { IconCheck } from '../components/icons.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { SelectField, TextField } from '../components/TextField.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { MemberAvatar } from '../features/balances/MemberAvatar.jsx';
import { AmountInput } from '../features/expenses/AmountInput.jsx';
import { CURRENCY_SYMBOL, convertedAmount, convertExactShares, currencyOfAsset, EXPENSE_CURRENCIES, rateFor, rateProblem } from '../features/expenses/currency.js';
import { cleanAmountInput, descriptionError as describeProblem, equalPreview, exactStatus } from '../features/expenses/splitPreview.js';
import { useApi } from '../hooks/useApi.js';
import { useT } from '../hooks/useT.js';
import { useToast } from '../hooks/useToast.js';
import { ASSETS, useAssetCode } from '../lib/asset.js';
import { formatMoney, memberName } from '../lib/format.js';
import { useEstimate, useRates } from '../hooks/useRates.js';

const AMOUNT_ERRORS = {
  INVALID_FORMAT: 'expense.errFormat',
  TOO_MANY_DECIMALS: 'expense.errDecimals',
  NOT_POSITIVE: 'expense.errPositive',
};

export default function ExpenseNew() {
  const { t } = useT();
  const { id } = useParams();
  const group = useApi(() => getGroup(id), `group:${id}`);
  return (
    <>
      <TopBar backTo={`/groups/${id}`} title={t('expense.title')} />
      {group.loading && <Loading label={t('group.loading')} />}
      {group.error && <LoadError title={t('group.loadError')} error={group.error} onRetry={group.reload} />}
      {group.data && (
        <AssetProvider group={group.data.group}>
          <ExpenseForm detail={group.data} />
        </AssetProvider>
      )}
    </>
  );
}

/** @param {{ detail: any }} props */
function ExpenseForm({ detail }) {
  const { t } = useT();
  const code = useAssetCode();
  const estimate = useEstimate();
  const { rates: ratesPerUsd, source: ratesSource } = useRates();
  const navigate = useNavigate();
  const toast = useToast();
  const prefill = useLocation().state?.prefill;
  const { members, me, group } = detail;
  const humans = members.filter((m) => m.kind === 'human').map((m) => m.id);

  const [amount, setAmount] = useState(prefill?.amount ?? '');
  const groupCurrency = currencyOfAsset(code);
  // The currency the amount is typed in. The group's own unless the person (or a scanned ticket) says otherwise (ADR 0011).
  const [currency, setCurrency] = useState(prefill?.currency ?? groupCurrency);
  const [typedRate, setTypedRate] = useState('');
  const [editingRate, setEditingRate] = useState(false);
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [paidBy, setPaidBy] = useState(me);
  const [splitType, setSplitType] = useState('equal');
  const [participants, setParticipants] = useState(humans);
  const [exact, setExact] = useState(/** @type {Record<string, string>} */ ({}));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(/** @type {string | null} */ (null));
  // One key per form: a retry after a timeout cannot create the expense twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const amountCheck = validateAmount(amount);
  const foreign = currency !== groupCurrency;
  const used = rateFor({ currency, groupCurrency, ratesPerUsd, typed: typedRate });
  const rateError = editingRate && typedRate !== '' && rateProblem(typedRate) ? t('expense.rateInvalid') : null;
  // What the group's balance gets: the amount itself, or the amount converted once at the rate in use.
  const groupAmount = foreign ? convertedAmount(amount, used?.rate) : amount;
  const amountError = touched && !amountCheck.ok ? t(AMOUNT_ERRORS[amountCheck.code]) : null;
  // The helper decides when to complain; the words come from the translations.
  const problem = describeProblem(description, touched);
  const descriptionError = !problem ? null : containsSecretKey(description) ? t('secret.warningShort') : t('expense.descriptionRequired');
  const ordered = members.map((m) => m.id).filter((mid) => participants.includes(mid));
  const equal = equalPreview(groupAmount, ordered, paidBy);
  const exactCheck = exactStatus(amount, exact);
  const splitOk = splitType === 'equal' ? Boolean(equal) : exactCheck.state === 'ok';
  const canSave = amountCheck.ok && Boolean(groupAmount) && !rateError && description.trim() && !descriptionError && splitOk;
  const byId = new Map(members.map((m) => [m.id, m]));

  function toggleParticipant(memberId) {
    setParticipants((all) => (all.includes(memberId) ? all.filter((x) => x !== memberId) : [...all, memberId]));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setTouched(true);
    if (!canSave) return;
    setSaving(true);
    setServerError(null);
    // Shares typed in the expense's currency are converted together, so they add up to exactly the converted amount.
    const exactShares = exactCheck.shares.map((s) => ({ memberId: s.memberId, amount: s.amount }));
    const split =
      splitType === 'equal'
        ? { type: 'equal', participants: ordered }
        : { type: 'exact', shares: foreign ? convertExactShares(exactShares, used.rate) : exactShares };
    const money = foreign ? { original: { amount, currency, rate: used.rate } } : { amount };
    try {
      await createExpense(group.id, { description: description.trim(), ...money, paidBy, split, source: prefill?.source ?? 'manual' }, { idempotencyKey });
      toast(t('expense.added', { description: description.trim() }), { tone: 'success' });
      navigate(`/groups/${group.id}`, { replace: true });
    } catch (e) {
      // The API refuses a rate far from the market one and says what it is: show it so the person can fix a misplaced decimal point.
      setServerError(
        e?.code === 'SPLIT_MISMATCH'
          ? t('expense.errMismatch')
          : e?.code === 'RATE_OFF_MARKET'
            ? t('expense.errRate', { group: groupCurrency, expected: e.details?.expected ?? '', currency })
            : t('expense.errSave'),
      );
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6 pt-2 pb-8">
      <h1 className="sr-only">{t('expense.srHeading', { group: group.name })}</h1>
      {prefill?.source === 'scan' && (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">
          {t('expense.fromReceipt')}
          {prefill.hint ? ` ${prefill.hint}` : ''}
        </p>
      )}
      <AmountInput value={amount} onChange={setAmount} error={amountError} currency={foreign ? currency : null} />
      <SelectField
        label={t('expense.currency')}
        value={currency}
        onChange={(e) => {
          setCurrency(e.target.value);
          setTypedRate('');
          setEditingRate(false);
        }}
        options={EXPENSE_CURRENCIES.map((c) => ({
          value: c,
          label: c === groupCurrency ? t('expense.currencyGroup', { currency: c, asset: code }) : `${c} · ${t(`currency.${c}`)}`,
        }))}
        hint={foreign ? undefined : t('expense.currencyHint', { asset: code })}
      />
      {foreign && used && (
        <Card className="flex flex-col gap-3" aria-live="polite">
          <p className="font-semibold">
            {amountCheck.ok && groupAmount
              ? t('expense.converted', { amount: formatMoney(amount, currency), result: formatMoney(groupAmount, code), asset: code })
              : t('expense.convertedEmpty', { asset: code })}
          </p>
          <p className="text-sm text-muted">
            {t('expense.rateLine', { group: groupCurrency, rate: used.rate, currency })} ·{' '}
            {used.custom ? t('expense.rateYours') : ratesSource === 'live' ? t('expense.rateLive') : t('expense.rateSample')}
          </p>
          <p className="text-sm text-muted">{t('expense.rateFixed')}</p>
          {editingRate ? (
            <TextField
              label={t('expense.rateLabel', { group: groupCurrency, currency })}
              inputMode="decimal"
              value={typedRate}
              onChange={(e) => setTypedRate(cleanAmountInput(e.target.value))}
              error={rateError}
              hint={t('expense.rateHint')}
            />
          ) : (
            <Button variant="ghost" onClick={() => setEditingRate(true)}>
              {t('expense.changeRate')}
            </Button>
          )}
        </Card>
      )}
      <TextField
        label={t('expense.what')}
        placeholder={t('expense.whatPlaceholder')}
        maxLength={80}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={descriptionError}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t('expense.paidBy')}</legend>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <Chip key={m.id} selected={paidBy === m.id} onClick={() => setPaidBy(m.id)} icon={<MemberAvatar member={m} size="sm" />}>
              {memberName(m, me)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <Segmented
        label={t('expense.split')}
        value={splitType}
        onChange={setSplitType}
        options={[
          { value: 'equal', label: t('expense.equally') },
          { value: 'exact', label: t('expense.exact') },
        ]}
      />

      {splitType === 'equal' ? (
        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t('expense.splitBetween')}</legend>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <Chip key={m.id} selected={participants.includes(m.id)} onClick={() => toggleParticipant(m.id)}>
                  {memberName(m, me)}
                </Chip>
              ))}
            </div>
          </fieldset>
          {participants.length === 0 && (
            <p role="alert" className="text-sm font-medium text-owe">
              {t('expense.chooseOne')}
            </p>
          )}
          {equal && (
            <Card className="flex flex-col divide-y divide-line py-1">
              {equal.map((share) => {
                const member = byId.get(share.memberId);
                const est = member?.homeCurrency ? estimate(share.amount, member.homeCurrency) : null;
                return (
                  <div key={share.memberId} className="flex min-h-14 items-center justify-between gap-3">
                    <span className="flex items-center gap-3">
                      <MemberAvatar member={member} size="sm" />
                      {memberName(member, me)}
                    </span>
                    <Amount value={share.amount} size="sm" estimate={est ?? undefined} className="items-end" />
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Card className="flex flex-col divide-y divide-line py-1">
            {members.map((m) => (
              <label key={m.id} className="flex min-h-16 items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <MemberAvatar member={m} size="sm" />
                  <span>
                    {memberName(m, me)}
                    <span className="sr-only"> {t('expense.shareSr', { asset: code })}</span>
                  </span>
                </span>
                <span className="flex items-center gap-1 rounded-input border-2 border-line bg-bg px-3 focus-within:border-text">
                  <span aria-hidden="true" className="text-muted">
                    {foreign ? (CURRENCY_SYMBOL[currency] ?? '') : ASSETS[code].symbol}
                  </span>
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={exact[m.id] ?? ''}
                    onChange={(e) => setExact((all) => ({ ...all, [m.id]: cleanAmountInput(e.target.value) }))}
                    className="min-h-11 w-24 bg-transparent text-right tabular-nums focus:outline-none"
                  />
                </span>
              </label>
            ))}
          </Card>
          <ExactSummary status={exactCheck} amount={amount} unit={foreign ? currency : code} />
        </div>
      )}

      <p className="text-sm text-muted">{t('expense.private')}</p>
      {serverError && (
        <p role="alert" className="font-medium text-owe">
          {serverError}
        </p>
      )}
      <Button type="submit" block loading={saving} disabled={touched && !canSave}>
        {t('expense.save')}
      </Button>
    </form>
  );
}

/** @param {{ status: ReturnType<typeof exactStatus>, amount: string, unit: string }} props unit: the currency the shares are typed in */
function ExactSummary({ status, amount, unit }) {
  const { t } = useT();
  const formatUsd = (v) => formatMoney(v, unit);
  const total = validateAmount(amount).ok ? formatUsd(amount) : null;
  const params = { total, sum: formatUsd(status.sum), difference: formatUsd(status.difference) };
  const text = {
    'no-amount': t('expense.sum.noAmount'),
    'bad-share': t('expense.sum.badShare'),
    empty: t('expense.sum.empty', params),
    under: t('expense.sum.under', params),
    over: t('expense.sum.over', params),
    ok: t('expense.sum.ok', params),
  }[status.state];
  return (
    <p aria-live="polite" className={status.state === 'ok' ? 'flex items-center gap-2 font-semibold text-owed' : 'font-medium text-owe'}>
      {status.state === 'ok' && <IconCheck size={18} />}
      {text}
    </p>
  );
}
