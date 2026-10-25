import { useNavigate, useLocation } from 'react-router';
import { Button } from '../../components/Button.jsx';
import { IconExternal } from '../../components/icons.jsx';
import { FREIGHTER_INSTALL_URL } from '../../config/env.js';
import { enterDemo } from '../../lib/demoMode.js';
import { useT } from '../../hooks/useT.js';
import { useWallet } from '../../hooks/useWallet.js';
import { WalletProblem } from './WalletProblem.jsx';

/** Connect button plus the wallet states (not installed, locked, rejected, wrong network). */
export function ConnectPanel() {
  const { t } = useT();
  const wallet = useWallet();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleConnect() {
    if (await wallet.connect()) navigate('/verify', { state: location.state });
  }

  return (
    <div className="flex flex-col gap-4">
      {wallet.error && <WalletProblem code={wallet.error} onRetry={wallet.error === 'WRONG_NETWORK' ? wallet.recheckNetwork : handleConnect} />}
      {wallet.error !== 'NOT_INSTALLED' && (
        <Button block loading={wallet.status === 'connecting'} onClick={handleConnect}>
          {wallet.status === 'connecting' ? t('connect.waiting') : t('connect.button')}
        </Button>
      )}
      <a
        href={FREIGHTER_INSTALL_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center justify-center gap-1 text-sm font-medium underline underline-offset-4"
      >
        {t('connect.getFreighter')} <IconExternal size={16} />
        <span className="sr-only">{t('common.opensNewTab')}</span>
      </a>
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <Button block variant="outline" onClick={enterDemo}>
          {t('connect.explore')}
        </Button>
        <p className="text-center text-sm text-muted">{t('connect.exploreNote')}</p>
      </div>
    </div>
  );
}
