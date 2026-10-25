import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { acceptInvite } from '../client/api.js';
import { Button, ButtonLink } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { useT } from '../hooks/useT.js';

export default function Join() {
  const { t } = useT();
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
        <h1 className="font-display-wide text-4xl">{t('join.title')}</h1>
        <p className="text-lg text-muted">{t('join.intro')}</p>
        <Card className="flex flex-col gap-1">
          <span className="text-sm text-muted">{t('join.code')}</span>
          <span className="font-mono">{code}</span>
        </Card>
        {state === 'not-found' && (
          <Card tone="outline" role="alert">
            {t('join.expired')}
          </Card>
        )}
        {state === 'error' && (
          <Card tone="outline" role="alert">
            {t('join.error')}
          </Card>
        )}
        {state === 'not-found' ? (
          <ButtonLink to="/groups" block>
            {t('join.goToGroups')}
          </ButtonLink>
        ) : (
          <Button block loading={state === 'joining'} onClick={join} className="mt-auto">
            {t('join.join')}
          </Button>
        )}
      </div>
    </>
  );
}
