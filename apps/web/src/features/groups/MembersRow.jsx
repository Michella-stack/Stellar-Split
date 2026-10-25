import { MemberAvatar } from '../balances/MemberAvatar.jsx';

/** Horizontal list of members with their home currency. @param {{ members: any[], meId: string }} props */
export function MembersRow({ members, meId }) {
  return (
    <ul aria-label="Members" className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
      {members.map((m) => (
        <li key={m.id} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
          <MemberAvatar member={m} />
          <span className="w-full truncate text-xs font-medium">{m.id === meId ? 'You' : m.displayName}</span>
          <span className="font-mono text-[11px] text-muted">{m.kind === 'agent' ? 'Agent' : m.homeCurrency}</span>
        </li>
      ))}
    </ul>
  );
}
