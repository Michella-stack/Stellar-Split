import { AgentAvatar, Avatar } from '../../components/Avatar.jsx';

/** Avatar for a group member: initials for people, the dashed robot for the agent. @param {{ member: any, size?: 'sm' | 'md' | 'lg' }} props */
export function MemberAvatar({ member, size = 'md' }) {
  return member.kind === 'agent' ? <AgentAvatar size={size} /> : <Avatar name={member.displayName ?? '?'} id={member.id} size={size} />;
}
