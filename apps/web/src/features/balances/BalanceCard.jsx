import { Link } from 'react-router';
import { Amount } from '../../components/Amount.jsx';
import { ButtonLink } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { totalOwed } from '../settlement/queue.js';
import { formatUsd, memberName } from '../../lib/format.js';
import { useEstimate } from '../../hooks/useRates.js';

/**
 * The accent card with my position in a group: who I owe (with Settle up) or who owes me.
 * @param {{ detail: any, homeCurrency: string | null }} props detail is GroupDetail from the API
 */
export function BalanceCard({ detail, homeCurrency }) {
  const estimate = useEstimate();
  const { myPosition, members, me, group } = detail;
  const byId = new Map(members.map((m) => [m.id, m]));
  const [first, ...rest] = myPosition.owes;
  const est = (amount) => (homeCurrency ? estimate(amount, homeCurrency) : null);

  if (first) {
    const name = memberName(byId.get(first.to), me);
    return (
      <Card tone="accent" as="section" aria-label="Your balance" className="flex flex-col gap-4">
        <p className="text-sm font-semibold">{group.name}</p>
        <p className="font-display-wide text-3xl">You owe {name}</p>
        <Amount value={first.amount} size="lg" tone="inherit" estimate={est(first.amount) ?? undefined} />
        <ButtonLink variant="onAccent" to={`/groups/${group.id}/settle/${first.to}`}>
          Settle up with {name}
        </ButtonLink>
        {rest.length > 0 && (
          <ButtonLink
            variant="onAccent"
            to={`/groups/${group.id}/settle/${first.to}`}
            state={{ queue: myPosition.owes.map((t) => t.to) }}
          >
            Settle all · {formatUsd(totalOwed(myPosition.owes))}
          </ButtonLink>
        )}
        {rest.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-on-accent/20 pt-3 text-sm">
            {rest.map((t) => (
              <li key={t.to} className="flex items-center justify-between gap-3">
                <span>
                  You also owe {memberName(byId.get(t.to), me)} <strong>{formatPlain(t.amount)}</strong>
                </span>
                <Link to={`/groups/${group.id}/settle/${t.to}`} className="inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-4">
                  Settle
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
      <Card tone="accent" as="section" aria-label="Your balance" className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{group.name}</p>
        <p className="font-display-wide text-3xl">You’re owed</p>
        <Amount value={myPosition.net} size="lg" tone="inherit" estimate={est(myPosition.net) ?? undefined} />
        <ul className="flex flex-col gap-1 text-sm">
          {myPosition.owed.map((t) => (
            <li key={t.from}>
              {memberName(byId.get(t.from), me)} owes you {formatPlain(t.amount)}
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <Card tone="accent" as="section" aria-label="Your balance" className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{group.name}</p>
      <p className="font-display-wide text-3xl">All square</p>
      <p>You don’t owe anyone and nobody owes you.</p>
    </Card>
  );
}

/** @param {string} amount */
function formatPlain(amount) {
  return <Amount value={amount} size="sm" tone="inherit" className="inline-flex" />;
}
