import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { containsSecretKey } from '@shared/validation.js';
import { deleteGroup, getGroup, removeMember, updateGroup } from '../client/api.js';
import { Button, ButtonLink } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { Sheet } from '../components/Sheet.jsx';
import { TextField } from '../components/TextField.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { MemberAvatar } from '../features/balances/MemberAvatar.jsx';
import { useApi } from '../hooks/useApi.js';
import { useT } from '../hooks/useT.js';
import { useToast } from '../hooks/useToast.js';

/** Edit the group, add or remove people, leave it or delete it. Editing and deleting are for the person who created it. */
export default function GroupSettings() {
  const { t } = useT();
  const { id } = useParams();
  const group = useApi(() => getGroup(id), `group:${id}`);
  const detail = group.data;

  return (
    <>
      <TopBar backTo={`/groups/${id}`} title={detail?.group.name ?? t('settings.title')} />
      {group.loading && <Loading label={t('group.loading')} />}
      {group.error && <LoadError title={t('group.loadError')} error={group.error} onRetry={group.reload} />}
      {detail && <Settings detail={detail} reload={group.reload} />}
    </>
  );
}

/** @param {{ detail: any, reload: () => void }} props */
function Settings({ detail, reload }) {
  const { t } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { group, members } = detail;
  const me = members.find((m) => m.id === detail.me);
  const isCreator = group.createdBy === me?.address;

  const [name, setName] = useState(group.name);
  const [type, setType] = useState(group.type);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(/** @type {{ kind: 'member', member: any } | { kind: 'group' } | null} */ (null));
  const [working, setWorking] = useState(false);
  const nameError = containsSecretKey(name) ? t('secret.warningShort') : null;
  const changed = name.trim() !== group.name || type !== group.type;

  async function save(event) {
    event.preventDefault();
    if (!changed || !name.trim() || nameError) return;
    setSaving(true);
    try {
      await updateGroup(group.id, { name: name.trim(), type });
      toast(t('settings.saved'), { tone: 'success' });
      reload();
    } catch {
      toast(t('settings.saveError'), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function confirmed() {
    if (!confirm) return;
    setWorking(true);
    try {
      if (confirm.kind === 'group') {
        const { result } = await deleteGroup(group.id);
        toast(t(result === 'archived' ? 'settings.archived' : 'settings.deleted'), { tone: 'success' });
        navigate('/groups', { replace: true });
        return;
      }
      await removeMember(group.id, confirm.member.id);
      if (confirm.member.id === detail.me) {
        toast(t('settings.left', { group: group.name }), { tone: 'success' });
        navigate('/groups', { replace: true });
        return;
      }
      toast(t('settings.removed', { name: confirm.member.displayName }), { tone: 'success' });
      setConfirm(null);
      reload();
    } catch (e) {
      toast(e?.code === 'MEMBER_HAS_HISTORY' ? t('settings.hasHistory') : e?.code === 'CREATOR_CANNOT_LEAVE' ? t('settings.creatorStays') : t('settings.actionError'), { tone: 'error' });
      setConfirm(null);
    } finally {
      setWorking(false);
    }
  }

  const removingSelf = confirm?.kind === 'member' && confirm.member.id === detail.me;

  return (
    <div className="flex flex-col gap-8 pb-8">
      <h1 className="font-display-wide text-4xl">{t('settings.title')}</h1>

      {isCreator && (
        <form onSubmit={save} noValidate className="flex flex-col gap-4" aria-labelledby="edit-title">
          <h2 id="edit-title" className="text-lg font-semibold">
            {t('settings.details')}
          </h2>
          <TextField label={t('groupNew.name')} maxLength={60} required value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
          <Segmented
            label={t('groupNew.type')}
            value={type}
            onChange={setType}
            options={[
              { value: 'flat', label: t('groupType.flat') },
              { value: 'trip', label: t('groupType.trip') },
              { value: 'other', label: t('groupNew.typeOther') },
            ]}
          />
          <Button type="submit" loading={saving} disabled={!changed || !name.trim() || Boolean(nameError)}>
            {t('settings.save')}
          </Button>
        </form>
      )}

      <section aria-labelledby="people-title" className="flex flex-col gap-3">
        <h2 id="people-title" className="text-lg font-semibold">
          {t('group.members')}
        </h2>
        <ul className="flex flex-col">
          {members.map((m) => {
            const canRemove = m.address !== group.createdBy && (isCreator || m.id === detail.me);
            return (
              <li key={m.id} className="flex min-h-16 items-center gap-3 py-2">
                <MemberAvatar member={m} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {m.id === detail.me ? t('settings.you', { name: m.displayName }) : m.displayName}
                  {m.address === group.createdBy && <span className="ml-2 text-sm font-normal text-muted">{t('settings.creator')}</span>}
                </span>
                {canRemove && (
                  <Button variant="ghost" onClick={() => setConfirm({ kind: 'member', member: m })}>
                    {m.id === detail.me ? t('settings.leave') : t('settings.remove')}
                    <span className="sr-only"> {m.displayName}</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <ButtonLink to={`/groups/${group.id}/invite`} variant="secondary" block>
          {t('settings.addPeople')}
        </ButtonLink>
      </section>

      {isCreator && (
        <Card as="section" aria-labelledby="danger-title" className="flex flex-col gap-3">
          <h2 id="danger-title" className="text-lg font-semibold">
            {t('settings.deleteTitle')}
          </h2>
          <p className="text-muted">{t('settings.deleteBody')}</p>
          <Button variant="outline" className="text-owe" onClick={() => setConfirm({ kind: 'group' })}>
            {t('settings.deleteGroup')}
          </Button>
        </Card>
      )}

      <Sheet
        open={confirm !== null}
        onClose={() => !working && setConfirm(null)}
        title={confirm?.kind === 'group' ? t('settings.deleteConfirmTitle') : removingSelf ? t('settings.leaveConfirmTitle') : t('settings.removeConfirmTitle')}
      >
        <p>
          {confirm?.kind === 'group'
            ? t('settings.deleteConfirmBody', { group: group.name })
            : removingSelf
              ? t('settings.leaveConfirmBody', { group: group.name })
              : t('settings.removeConfirmBody', { name: confirm?.member.displayName ?? '' })}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" disabled={working} onClick={() => setConfirm(null)}>
            {t('common.cancel')}
          </Button>
          <Button loading={working} onClick={confirmed}>
            {confirm?.kind === 'group' ? t('settings.deleteGroup') : removingSelf ? t('settings.leave') : t('settings.remove')}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
