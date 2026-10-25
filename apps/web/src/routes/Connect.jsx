import { Navigate } from 'react-router';
import { TopBar } from '../components/TopBar.jsx';
import { ConnectPanel } from '../features/wallet/ConnectPanel.jsx';
import { useT } from '../hooks/useT.js';
import { useWallet } from '../hooks/useWallet.js';

export default function Connect() {
  const { t } = useT();
  const wallet = useWallet();
  if (wallet.address && wallet.network?.isTestnet && !wallet.error) return <Navigate to="/verify" replace />;
  return (
    <>
      <TopBar backTo="/" />
      <div className="flex flex-col gap-6 py-6">
        <h1 className="font-display-wide text-4xl">{t('connect.title')}</h1>
        <p className="text-muted">{t('connect.intro')}</p>
        <ConnectPanel />
      </div>
    </>
  );
}
