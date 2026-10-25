import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { WalletProblem } from '../features/wallet/WalletProblem.jsx';
import { useT } from '../hooks/useT.js';
import { useWallet } from '../hooks/useWallet.js';
import { shortAddress } from '../lib/format.js';

export default function Verify() {
  const { t } = useT();
  const wallet = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const from = location.state?.from ?? '/groups';

  if (wallet.session) return <Navigate to={from} replace />;

  async function handleSign() {
    setBusy(true);
    const ok = await wallet.signIn();
    setBusy(false);
    if (ok) navigate(from, { replace: true });
  }

  return (
    <>
      <TopBar backTo="/" />
      <div className="flex flex-1 flex-col gap-6 py-6">
        <h1 className="font-display-wide text-4xl">{t('verify.title')}</h1>
        <p className="text-lg text-muted">{t('verify.intro')}</p>
        <Card className="flex flex-col gap-1">
          <span className="text-sm text-muted">{t('verify.wallet')}</span>
          <span className="font-mono text-lg" title={wallet.address ?? ''}>
            {wallet.address ? shortAddress(wallet.address) : '—'}
          </span>
        </Card>
        {wallet.error && <WalletProblem code={wallet.error} onRetry={wallet.error === 'WRONG_NETWORK' ? wallet.recheckNetwork : handleSign} />}
        <Button block loading={busy} onClick={handleSign}>
          {busy ? t('connect.waiting') : t('verify.button')}
        </Button>
        <p className="text-sm text-muted">{t('verify.note')}</p>
      </div>
    </>
  );
}
