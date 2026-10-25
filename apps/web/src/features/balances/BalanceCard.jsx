import { Link } from 'react-router';
import { Amount } from '../../components/Amount.jsx';
import { ButtonLink } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { useEstimate } from '../../hooks/useRates.js';
import { useT } from '../../hooks/useT.js';
import { formatUsd, memberName } from '../../lib/format.js';
import { totalOwed } from '../settlement/queue.js';

/**
 * The accent card with my position in a group: who I owe (with Settle up) or who owes me.
 * @param {{ detail: any, homeCurrency: string | null }} props detail is GroupDetail from the API
 */
export function BalanceCard({ detail, homeCurrency }) {
  const { t } = useT();
  const estimate = useEstimate();
  const { myPosition, members, me, group } = detail;
  const byId = new Map(members.map((m) => [m.id, m]));
  const [first, ...rest] = myPosition.owes;
  const est = (amount) => (homeCurrency ? estimate(amount, homeCurrency) : null);

  if (first) {
    const name = memberName(byId.get(first.to), me);
    return (
      <Card tone="accent" as="section" aria-label={t('balance.yourBalance')} className="flex flex-col gap-4">
        <p className="text-sm font-semibold">{group.name}</p>
        <p className="font-display-wide text-3xl">{t('balance.youOwe', { name })}</p>
        <Amount value={first.amount} size="lg" tone="inherit" estimate={est(first.amount) ?? undefined} />
        <ButtonLink variant="onAccent" to={`/groups/${group.id}/settle/${first.to}`}>
          {t('balance.settleWith', { name })}
        </ButtonLink>
        {rest.length > 0 && (
          <ButtonLink
            variant="onAccent"
            to={`/groups/${group.id}/settle/${first.to}`}
            state={{ queue: myPosition.owes.map((transfer) => transfer.to) }}
          >
            {t('balance.settleAll', { total: formatUsd(totalOwed(myPosition.owes)) })}
          </ButtonLink>
        )}
        {rest.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-on-accent/20 pt-3 text-sm">
            {rest.map((transfer) => (
              <li key={transfer.to} className="flex items-center justify-between gap-3">
                <span>
                  {t('balance.alsoOwe', { name: memberName(byId.get(transfer.to), me) })} <strong>{formatPlain(transfer.amount)}</strong>
                </span>
                <Link
                  to={`/groups/${group.id}/settle/${transfer.to}`}
                  className="inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-4"
                >
                  {t('balance.settle')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  if (myPosition.owed.length > 0) {
    return (
      <Card tone="accent" as="section" aria-label={t('balance.yourBalance')} className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{group.name}</p>
        <p className="font-display-wide text-3xl">{t('balance.youAreOwed')}</p>
        <Amount value={myPosition.net} size="lg" tone="inherit" estimate={est(myPosition.net) ?? undefined} />
        <ul className="flex flex-col gap-1 text-sm">
          {myPosition.owed.map((transfer) => (
            <li key={transfer.from}>
              {t('balance.owesYou', { name: memberName(byId.get(transfer.from), me) })} {formatPlain(transfer.amount)}
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <Card tone="accent" as="section" aria-label={t('balance.yourBalance')} className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{group.name}</p>
      <p className="font-display-wide text-3xl">{t('balance.allSquare')}</p>
      <p>{t('balance.allSquareBody')}</p>
    </Card>
  );
}

/** @param {string} amount */
function formatPlain(amount) {
  return <Amount value={amount} size="sm" tone="inherit" className="inline-flex" />;
}
