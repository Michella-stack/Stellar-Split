import { useState } from 'react';
import * as api from '../../client/api.js';
import { AddressLink } from '../../components/AddressLink.jsx';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useT } from '../../hooks/useT.js';
import { useWallet } from '../../hooks/useWallet.js';
import { agentErrorKey } from './agentErrors.js';
import { formatDate } from '../../lib/format.js';
import { looksLikeStellarAddress } from '@shared/validation.js';

/** Link an agent to this account by signing a message, and revoke linked agents. */
export function YourAgent() {
  const { t } = useT();
  const wallet = useWallet();
  const list = useApi(() => api.listMyAgents(), 'my-agents');
  const [address, setAddress] = useState('');
  const [touched, setTouched] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [confirming, setConfirming] = useState(/** @type {string | null} */ (null));
  const [revoking, setRevoking] = useState(false);

  const trimmed = address.trim();
  const invalid = trimmed !== '' && !looksLikeStellarAddress(trimmed);
  const active = (list.data?.agents ?? []).filter((a) => !a.revokedAt);

  async function link() {
    setTouched(true);
    if (!looksLikeStellarAddress(trimmed)) return;
    setBusy(true);
    setError(null);
    try {
      const challenge = await api.createAgentLinkChallenge({ agentAddress: trimmed });
      setMessage(challenge.message);
      const { signature } = await wallet.signMessage(challenge.message, { kind: 'agent-link', signer: wallet.address, agent: trimmed });
      await api.linkAgent({ agentAddress: trimmed, message: challenge.message, signature });
      setAddress('');
      setTouched(false);
      list.reload();
    } catch (e) {
      setError(agentErrorKey(e));
    } finally {
      setMessage(null);
      setBusy(false);
    }
  }

  async function revoke(agentAddress) {
    setRevoking(true);
    setError(null);
    try {
      await api.revokeAgent(agentAddress);
      setConfirming(null);
      list.reload();
    } catch (e) {
      setError(agentErrorKey(e));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <section aria-labelledby="agent-title" className="flex flex-col gap-3">
      <h2 id="agent-title" className="text-lg font-semibold">
        {t('yourAgent.title')}
      </h2>
      <Card className="flex flex-col gap-4">
        <p className="text-muted">{t('yourAgent.intro')}</p>

        {list.error ? (
          <p role="alert" className="text-sm font-medium text-owe">
            {t('yourAgent.listError')}
          </p>
        ) : list.loading ? (
          <p role="status" className="text-muted">
            {t('yourAgent.loading')}
          </p>
        ) : active.length === 0 ? (
          <p className="text-muted">{t('yourAgent.none')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {active.map((a) => (
              <li key={a.address} className="flex flex-col gap-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <AddressLink address={a.address} />
                    <span className="text-sm text-muted">{t('yourAgent.linkedOn', { date: formatDate(a.linkedAt) })}</span>
                  </div>
                  {confirming !== a.address && (
                    <Button variant="outline" className="min-h-11 px-4" onClick={() => setConfirming(a.address)}>
                      {t('yourAgent.revoke')}
                    </Button>
                  )}
                </div>
                {confirming === a.address && (
                  <div role="group" aria-label={t('yourAgent.confirmTitle')} className="flex flex-col gap-3 rounded-input border-2 border-line p-4">
                    <p className="font-medium">{t('yourAgent.confirmTitle')}</p>
                    <p className="text-sm text-muted">{t('yourAgent.confirmBody')}</p>
                    <div className="flex gap-2">
                      <Button variant="primary" className="min-h-11 px-4" loading={revoking} onClick={() => revoke(a.address)}>
                        {t('yourAgent.confirmRevoke')}
                      </Button>
                      <Button variant="secondary" className="min-h-11 px-4" disabled={revoking} onClick={() => setConfirming(null)}>
                        {t('yourAgent.keep')}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            link();
          }}
        >
          <TextField
            label={t('yourAgent.addressLabel')}
            hint={t('yourAgent.addressHint')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="G..."
            autoComplete="off"
            spellCheck={false}
            inputClassName="font-mono"
            error={(touched || invalid) && !looksLikeStellarAddress(trimmed) ? t('yourAgent.err.invalid') : null}
          />
          <Button type="submit" variant="secondary" loading={busy}>
            {t('yourAgent.link')}
          </Button>
        </form>

        {message && (
          <div role="status" className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t('yourAgent.signing')}</p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-input bg-surface-2 p-3 font-mono text-xs">{message}</pre>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-owe">
            {t(error)}
          </p>
        )}
      </Card>
    </section>
  );
}
