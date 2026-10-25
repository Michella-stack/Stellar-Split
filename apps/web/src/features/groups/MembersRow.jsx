import { useT } from '../../hooks/useT.js';
import { MemberAvatar } from '../balances/MemberAvatar.jsx';

/** Horizontal list of members with their home currency. @param {{ members: any[], meId: string }} props */
export function MembersRow({ members, meId }) {
  const { t } = useT();
  return (
    <ul aria-label={t('group.members')} className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
      {members.map((m) => (
        <li key={m.id} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
          <MemberAvatar member={m} />
          <span className="w-full truncate text-xs font-medium">{m.id === meId ? t('common.you') : m.displayName}</span>
          <span className="font-mono text-[11px] text-muted">{m.kind === 'agent' ? t('common.agent') : m.homeCurrency}</span>
        </li>
      ))}
    </ul>
  );
}
