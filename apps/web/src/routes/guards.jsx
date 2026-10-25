import { Navigate, Outlet, useLocation } from 'react-router';
import { TopBar } from '../components/TopBar.jsx';
import { WalletProblem } from '../features/wallet/WalletProblem.jsx';
import { useWallet } from '../hooks/useWallet.js';

/** Full-screen loading state while the wallet connection is restored. */
export function WalletChecking() {
  return (
    <div role="status" className="flex flex-1 items-center justify-center py-24 text-muted">
      Checking your wallet…
    </div>
  );
}

/**
 * Lets a screen render only when the wallet is connected on Testnet, signed in and has a profile.
 * Otherwise sends the person to the step they are missing and brings them back afterwards.
 * @param {{ needs?: 'wallet' | 'session' | 'profile' }} props
 */
export function RequireWallet({ needs = 'profile' }) {
  const wallet = useWallet();
  const location = useLocation();
  const from = location.pathname + location.search;

  if (wallet.status === 'checking') return <WalletChecking />;
  if (!wallet.address) return <Navigate to="/" replace state={{ from }} />;
  if (wallet.network && !wallet.network.isTestnet) {
    return (
      <>
        <TopBar />
        <div className="py-6">
          <WalletProblem code="WRONG_NETWORK" onRetry={wallet.recheckNetwork} />
        </div>
      </>
    );
  }
  if (needs === 'wallet') return <Outlet />;
  if (!wallet.session) return <Navigate to="/verify" replace state={{ from }} />;
  if (needs === 'session') return <Outlet />;
  if (!wallet.profile?.displayName || !wallet.profile?.homeCurrency) return <Navigate to="/onboarding" replace state={{ from }} />;
  return <Outlet />;
}
