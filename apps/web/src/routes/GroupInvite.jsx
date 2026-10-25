import { useState } from 'react';
import { useParams } from 'react-router';
import { createInvite, getGroup } from '../client/api.js';
import { Button, ButtonLink } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { IconCopy, IconShare } from '../components/icons.jsx';
import { LoadError, Loading } from '../components/LoadState.jsx';
import { TextField } from '../components/TextField.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { addressError } from '../features/groups/address.js';
import { useApi } from '../hooks/useApi.js';
import { useCopy } from '../hooks/useCopy.js';
import { useToast } from '../hooks/useToast.js';
import { shortAddress } from '../lib/format.js';

export default function GroupInvite() {
  const { id } = useParams();
  const copy = useCopy();
  const toast = useToast();
  const group = useApi(() => getGroup(id), `group:${id}`);
  const link = useApi(() => createInvite(id), `invite:${id}`);
  const [address, setAddress] = useState('');
  const [adding, setAdding] = useState(false);
  const error = addressError(address);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function addByAddress(event) {
    event.preventDefault();
    if (error || !address.trim()) return;
    setAdding(true);
    try {
      await createInvite(id, { address: address.trim() });
      toast(`Invite created for ${shortAddress(address.trim())}`, { tone: 'success' });
      setAddress('');
    } catch (e) {
      toast(e?.code === 'ALREADY_MEMBER' ? 'That address is already in the group.' : 'Could not add that address. Try again.', { tone: 'error' });
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <TopBar backTo={`/groups/${id}`} title="Invite" />
      <div className="flex flex-col gap-8 pb-8">
        <h1 className="font-display-wide text-4xl">Invite people{group.data ? ` to ${group.data.group.name}` : ''}</h1>

        <section aria-labelledby="link-title" className="flex flex-col gap-3">
          <h2 id="link-title" className="text-lg font-semibold">
            Share a link
          </h2>
          {link.loading && <Loading label="Creating invite link" />}
          {link.error && <LoadError title="Could not create a link" error={link.error} onRetry={link.reload} />}
          {link.data && (
            <Card className="flex flex-col gap-4">
              <p className="font-mono text-sm break-all">{link.data.inviteUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={<IconCopy size={20} />} onClick={() => copy(link.data.inviteUrl, 'Invite link')}>
                  Copy link
                </Button>
                {canShare && (
                  <Button
                    variant="secondary"
                    icon={<IconShare size={20} />}
                    onClick={() => navigator.share({ title: 'Join my group on Stellar Split', url: link.data.inviteUrl }).catch(() => {})}
                  >
                    Share
                  </Button>
                )}
              </div>
            </Card>
          )}
        </section>

        <form onSubmit={addByAddress} noValidate className="flex flex-col gap-3" aria-labelledby="address-title">
          <h2 id="address-title" className="text-lg font-semibold">
            Or add by Stellar address
          </h2>
          <TextField
            label="Their public address"
            placeholder="G…"
            autoComplete="off"
            spellCheck={false}
            inputClassName="font-mono"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={error}
            hint="Ask them to copy it from Freighter. Never paste a secret key."
          />
          <Button type="submit" variant="outline" loading={adding} disabled={!address.trim() || Boolean(error)}>
            Add to group
          </Button>
        </form>

        <ButtonLink to={`/groups/${id}`} block>
          Done
        </ButtonLink>
      </div>
    </>
  );
}
