import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button.jsx';
import { Card } from '../components/Card.jsx';
import { Chip } from '../components/Chip.jsx';
import { IconButton } from '../components/IconButton.jsx';
import { IconCopy, IconExternal } from '../components/icons.jsx';
import { Pill } from '../components/Pill.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { fundWithFriendbot, loadBalances } from '../client/stellar.js';
import { USDC_FAUCET_URL } from '../config/env.js';
import { useCopy } from '../hooks/useCopy.js';
import { useTheme } from '../hooks/useTheme.js';
import { useWallet } from '../hooks/useWallet.js';
import { shortAddress } from '../lib/format.js';
import { ACCENTS } from '../lib/theme.js';

const ACCENT_NAMES = { lime: 'Lime', cyan: 'Cyan', orange: 'Orange', violet: 'Violet' };

export default function Wallet() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const copy = useCopy();
  const { theme, toggleTheme, accent, setAccent } = useTheme();
  const [balances, setBalances] = useState(/** @type {any} */ (null));
  const [loadError, setLoadError] = useState(false);
  const [funding, setFunding] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet.address) return;
    setLoadError(false);
    setBalances(null);
    try {
      setBalances(await loadBalances(wallet.address));
    } catch {
      setLoadError(true);
    }
  }, [wallet.address]);

  useEffect(() => {
    // Loading external data on mount is the effect's purpose here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function fund() {
    setFunding(true);
    try {
      await fundWithFriendbot(wallet.address);
      await refresh();
    } catch {
      setLoadError(true);
    } finally {
      setFunding(false);
    }
  }

  return (
    <>
      <TopBar title="Wallet" />
      <div className="flex flex-col gap-6 pb-8">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-sm text-muted">{wallet.profile?.displayName ?? 'Your wallet'}</span>
              <span className="font-mono text-lg" title={wallet.address ?? ''}>
                {wallet.address ? shortAddress(wallet.address) : '—'}
              </span>
            </div>
            <IconButton label="Copy full address" onClick={() => copy(wallet.address, 'Address')}>
              <IconCopy size={20} />
            </IconButton>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill tone="solid">Freighter</Pill>
            <Pill mono>Stellar Testnet</Pill>
          </div>
        </Card>

        <section aria-labelledby="balances-title" className="flex flex-col gap-3">
          <h2 id="balances-title" className="text-lg font-semibold">
            Balances
          </h2>
          <Balances balances={balances} error={loadError} onRetry={refresh} onFund={fund} funding={funding} />
        </section>

        <section aria-labelledby="usdc-title" className="flex flex-col gap-2">
          <h2 id="usdc-title" className="text-lg font-semibold">
            Get testnet USDC
          </h2>
          <p className="text-muted">
            Testnet USDC is free and has no value. First your account needs a USDC trustline (you can add it when you settle up), then
            request USDC from Circle’s faucet: choose Stellar Testnet and paste your address.
          </p>
          <a
            href={USDC_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1 font-medium underline underline-offset-4"
          >
            Open Circle faucet <IconExternal size={16} />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </section>

        <section aria-labelledby="look-title" className="flex flex-col gap-4">
          <h2 id="look-title" className="text-lg font-semibold">
            Appearance
          </h2>
          <Segmented
            label="Theme"
            value={theme}
            onChange={(next) => next !== theme && toggleTheme()}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
          <div role="group" aria-label="Accent colour" className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <Chip key={a} selected={a === accent} onClick={() => setAccent(a)}>
                <span aria-hidden="true" className="size-4 rounded-full border border-line" style={{ background: `var(--swatch-${a})` }} />
                {ACCENT_NAMES[a]}
              </Chip>
            ))}
          </div>
        </section>

        <Button
          variant="outline"
          block
          onClick={() => {
            wallet.disconnect();
            navigate('/', { replace: true });
          }}
        >
          Disconnect
        </Button>
      </div>
    </>
  );
}

/** @param {{ balances: any, error: boolean, onRetry: () => void, onFund: () => void, funding: boolean }} props */
function Balances({ balances, error, onRetry, onFund, funding }) {
  if (error) {
    return (
      <Card tone="outline" role="alert" className="flex flex-col gap-3">
        <p>Could not load balances from Stellar Testnet.</p>
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </Card>
    );
  }
  if (!balances) {
    return (
      <Card role="status" className="text-muted">
        Loading balances…
      </Card>
    );
  }
  if (!balances.funded) {
    return (
      <Card tone="outline" className="flex flex-col gap-3">
        <p className="font-medium">This account is not on Testnet yet.</p>
        <p className="text-muted">Fund it with free test XLM from Friendbot to create it.</p>
        <Button variant="secondary" loading={funding} onClick={onFund}>
          Fund with Friendbot
        </Button>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col divide-y divide-line py-2">
      <BalanceRow code="USDC" value={balances.usdc} empty="No USDC trustline yet" />
      <BalanceRow code="XLM" value={balances.xlm} />
    </Card>
  );
}

/** @param {{ code: string, value: string | null, empty?: string }} props */
function BalanceRow({ code, value, empty }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3">
      <span className="font-mono font-semibold">{code}</span>
      {value === null ? <span className="text-sm text-muted">{empty}</span> : <span className="font-mono text-lg tabular-nums">{value}</span>}
    </div>
  );
}
