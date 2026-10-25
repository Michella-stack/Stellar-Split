import { useState } from 'react';
import { useParams } from 'react-router';
import { addMember, createInvite, getGroup } from '../client/api.js';
import { containsSecretKey } from '@shared/validation.js';
import { Button, ButtonLink } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { IconCopy, IconShare } from '../components/icons.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { QrCode } from '../components/QrCode.jsx';
import { TextField } from '../components/TextField.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { addressError } from '../features/groups/address.js';
import { useApi } from '../hooks/useApi.js';
import { useCopy } from '../hooks/useCopy.js';
import { useT } from '../hooks/useT.js';
import { useToast } from '../hooks/useToast.js';

export default function GroupInvite() {
  const { id } = useParams();
  const copy = useCopy();
  const toast = useToast();
  const { t } = useT();
  const group = useApi(() => getGroup(id), `group:${id}`);
  const link = useApi(() => createInvite(id), `invite:${id}`);
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const error = addressError(address);
  const nameError = containsSecretKey(name) ? t('secret.warningShort') : null;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function addByAddress(event) {
    event.preventDefault();
    if (error || nameError || !address.trim()) return;
    setAdding(true);
    try {
      const { member } = await addMember(id, { address: address.trim(), ...(name.trim() ? { displayName: name.trim() } : {}) });
      toast(t('invite.added', { name: member.displayName }), { tone: 'success' });
      setAddress('');
      setName('');
      group.reload();
    } catch (e) {
      toast(e?.code === 'ALREADY_MEMBER' ? t('invite.alreadyMember') : t('invite.addError'), { tone: 'error' });
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <TopBar backTo={`/groups/${id}`} title={t('invite.title')} />
      <div className="flex flex-col gap-8 pb-8">
        <h1 className="font-display-wide text-4xl">{group.data ? t('invite.headingTo', { group: group.data.group.name }) : t('invite.heading')}</h1>

        <section aria-labelledby="link-title" className="flex flex-col gap-3">
          <h2 id="link-title" className="text-lg font-semibold">
            {t('invite.shareLink')}
          </h2>
          {link.loading && <Loading label={t('invite.creating')} />}
          {link.error && <LoadError title={t('invite.linkError')} error={link.error} onRetry={link.reload} />}
          {link.data && (
            <Card className="flex flex-col gap-4">
              <QrCode value={link.data.inviteUrl} label={t('invite.qrLabel')} className="mx-auto w-48 max-w-full" />
              <p className="font-mono text-sm break-all">{link.data.inviteUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={<IconCopy size={20} />} onClick={() => copy(link.data.inviteUrl, 'copied.inviteLink')}>
                  {t('invite.copyLink')}
                </Button>
                {canShare && (
                  <Button
                    variant="secondary"
                    icon={<IconShare size={20} />}
                    onClick={() => navigator.share({ title: t('invite.shareTitle'), url: link.data.inviteUrl }).catch(() => {})}
                  >
                    {t('invite.share')}
                  </Button>
                )}
              </div>
            </Card>
          )}
        </section>

        <form onSubmit={addByAddress} noValidate className="flex flex-col gap-3" aria-labelledby="address-title">
          <h2 id="address-title" className="text-lg font-semibold">
            {t('invite.addByAddress')}
          </h2>
          <TextField
            label={t('invite.address')}
            placeholder="G…"
            autoComplete="off"
            spellCheck={false}
            inputClassName="font-mono"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={error}
            hint={t('invite.addressHint')}
          />
          <TextField label={t('invite.theirName')} optional maxLength={60} value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
          <Button type="submit" variant="outline" loading={adding} disabled={!address.trim() || Boolean(error) || Boolean(nameError)}>
            {t('invite.add')}
          </Button>
        </form>

        <ButtonLink to={`/groups/${id}`} block>
          {t('invite.done')}
        </ButtonLink>
      </div>
    </>
  );
}
