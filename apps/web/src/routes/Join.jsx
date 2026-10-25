import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { acceptInvite } from '../client/api.js';
import { Button, ButtonLink } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { TopBar } from '../components/TopBar.jsx';

export default function Join() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState(/** @type {'idle' | 'joining' | 'not-found' | 'error'} */ ('idle'));

  async function join() {
    setState('joining');
    try {
      const { groupId } = await acceptInvite(code);
      navigate(`/groups/${groupId}`, { replace: true });
    } catch (e) {
      setState(e?.code === 'NOT_FOUND' ? 'not-found' : 'error');
    }
  }

  return (
    <>
      <TopBar backTo="/groups" />
      <div className="flex flex-1 flex-col gap-6 py-6">
        <h1 className="font-display-wide text-4xl">You’re invited</h1>
        <p className="text-lg text-muted">Join the group to see shared expenses and settle up in USDC on Stellar Testnet.</p>
        <Card className="flex flex-col gap-1">
          <span className="text-sm text-muted">Invite code</span>
          <span className="font-mono">{code}</span>
        </Card>
        {state === 'not-found' && (
          <Card tone="outline" role="alert">
            This invite has expired or does not exist. Ask for a new link.
          </Card>
        )}
        {state === 'error' && (
          <Card tone="outline" role="alert">
            Could not join right now. Try again.
          </Card>
        )}
        {state === 'not-found' ? (
          <ButtonLink to="/groups" block>
            Go to your groups
          </ButtonLink>
        ) : (
          <Button block loading={state === 'joining'} onClick={join} className="mt-auto">
            Join group
          </Button>
        )}
      </div>
    </>
  );
}
