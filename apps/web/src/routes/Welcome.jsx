import { Navigate, useLocation } from 'react-router';
import { TopBar } from '../components/TopBar.jsx';
import { ConnectPanel } from '../features/wallet/ConnectPanel.jsx';
import { useWallet } from '../hooks/useWallet.js';
import { WalletChecking } from './guards.jsx';

const CURRENCIES = [
  { code: 'MXN', className: 'left-0 top-2' },
  { code: 'EUR', className: 'right-0 top-6' },
  { code: 'COP', className: 'left-4 bottom-0' },
  { code: 'USD', className: 'right-6 bottom-3' },
];

const BENEFITS = ['Split with friends abroad', 'Pay in digital dollars', 'See it in your currency'];

export default function Welcome() {
  const wallet = useWallet();
  const location = useLocation();

  if (wallet.status === 'checking') return <WalletChecking />;
  // Already connected on Testnet: continue where the person was going.
  if (wallet.address && wallet.network?.isTestnet && !wallet.error) {
    return <Navigate to={wallet.session ? (location.state?.from ?? '/groups') : '/verify'} replace state={location.state} />;
  }

  return (
    <>
      <TopBar />
      <div className="flex flex-1 flex-col gap-8 pt-4 pb-8">
        <div aria-hidden="true" className="relative mx-auto h-48 w-full max-w-[320px]">
          <svg className="absolute inset-0 h-full w-full text-line" viewBox="0 0 320 192" fill="none">
            <path d="M40 30 L160 96 M280 40 L160 96 M60 170 L160 96 M260 160 L160 96" stroke="currentColor" strokeWidth="2" strokeDasharray="4 6" />
          </svg>
          {CURRENCIES.map((c) => (
            <span key={c.code} className={`absolute rounded-full border-2 border-line bg-surface px-4 py-2 font-mono text-sm font-semibold ${c.className}`}>
              {c.code}
            </span>
          ))}
          <span className="absolute top-1/2 left-1/2 flex size-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent font-mono text-sm font-bold text-on-accent">
            USDC
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="font-display-wide text-5xl">Different currencies. One balance.</h1>
          <p className="text-lg text-muted">Share costs with your flat or trip and settle up in digital dollars, straight to each other.</p>
        </div>

        <ul className="flex flex-wrap gap-2" aria-label="Why Stellar Split">
          {BENEFITS.map((b) => (
            <li key={b} className="rounded-full bg-surface-2 px-4 py-2 text-sm font-medium">
              {b}
            </li>
          ))}
        </ul>

        <ConnectPanel />

        <p className="mt-auto text-center text-sm text-muted">Runs on Stellar Testnet. No real money is used.</p>
      </div>
    </>
  );
}
