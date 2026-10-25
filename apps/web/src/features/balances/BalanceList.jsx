import { Amount } from '../../components/Amount.jsx';
import { ListRow } from '../../components/ListRow.jsx';
import { signOf } from '../../lib/format.js';
import { MemberAvatar } from './MemberAvatar.jsx';

/**
 * Everyone else's net position in the group. Words ("owes", "is owed") always accompany the colour.
 * @param {{ detail: any }} props
 */
export function BalanceList({ detail }) {
  const net = new Map(detail.balances.map((b) => [b.memberId, b.net]));
  const others = detail.members.filter((m) => m.id !== detail.me);
  return (
    <ul className="flex flex-col">
      {others.map((member) => {
        const value = net.get(member.id) ?? '0';
        const sign = signOf(value);
        return (
          <li key={member.id}>
            <ListRow
              leading={<MemberAvatar member={member} />}
              title={member.displayName}
              subtitle={member.kind === 'agent' ? 'Agent' : <span className="font-mono">{member.homeCurrency}</span>}
              trailing={
                sign === 0 ? (
                  <span className="text-sm text-muted">settled up</span>
                ) : (
                  <span className="flex flex-col items-end">
                    <span className="text-sm text-muted">{sign < 0 ? 'owes' : 'is owed'}</span>
                    <Amount value={value} size="sm" tone={sign < 0 ? 'owe' : 'owed'} />
                  </span>
                )
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
