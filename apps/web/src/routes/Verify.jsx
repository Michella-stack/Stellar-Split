import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { WalletProblem } from '../features/wallet/WalletProblem.jsx';
import { useWallet } from '../hooks/useWallet.js';
import { shortAddress } from '../lib/format.js';

export default function Verify() {
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
        <h1 className="font-display-wide text-4xl">Sign in</h1>
        <p className="text-lg text-muted">Sign a message to prove this wallet is yours. It costs nothing and moves no money.</p>
        <Card className="flex flex-col gap-1">
          <span className="text-sm text-muted">Wallet</span>
          <span className="font-mono text-lg" title={wallet.address ?? ''}>
            {wallet.address ? shortAddress(wallet.address) : '—'}
          </span>
        </Card>
        {wallet.error && <WalletProblem code={wallet.error} onRetry={wallet.error === 'WRONG_NETWORK' ? wallet.recheckNetwork : handleSign} />}
        <Button block loading={busy} onClick={handleSign}>
          {busy ? 'Waiting for Freighter…' : 'Sign in with Freighter'}
        </Button>
        <p className="text-sm text-muted">Freighter shows the sign-in message with your address. Signing it is not a transaction and moves no money.</p>
      </div>
    </>
  );
}
