import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AddressLink } from '../components/AddressLink.jsx';
import { LanguagePicker } from '../components/LanguagePicker.jsx';
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
import { useRates } from '../hooks/useRates.js';
import { useT } from '../hooks/useT.js';
import { useTheme } from '../hooks/useTheme.js';
import { useWallet } from '../hooks/useWallet.js';
import { DEMO } from '../lib/demoMode.js';
import { formatDate } from '../lib/format.js';
import { RATES_ATTRIBUTION_URL } from '../lib/rates.js';
import { ACCENTS } from '../lib/theme.js';

export default function Wallet() {
  const { t } = useT();
  const wallet = useWallet();
  const navigate = useNavigate();
  const copy = useCopy();
  const { theme, toggleTheme, accent, setAccent } = useTheme();
  const rates = useRates();
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
      <TopBar title={t('walletScreen.title')} />
      <div className="flex flex-col gap-6 pb-8">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-sm text-muted">{wallet.profile?.displayName ?? t('walletScreen.yourWallet')}</span>
              {wallet.address ? <AddressLink address={wallet.address} className="text-lg" /> : <span className="font-mono text-lg">—</span>}
            </div>
            <IconButton label={t('walletScreen.copyAddress')} onClick={() => copy(wallet.address, 'copied.address')}>
              <IconCopy size={20} />
            </IconButton>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill tone="solid">{t('walletScreen.freighter')}</Pill>
            <Pill mono>{t('common.stellarTestnet')}</Pill>
          </div>
        </Card>

        <section aria-labelledby="balances-title" className="flex flex-col gap-3">
          <h2 id="balances-title" className="text-lg font-semibold">
            {t('walletScreen.balances')}
          </h2>
          <Balances balances={balances} error={loadError} onRetry={refresh} onFund={fund} funding={funding} />
        </section>

        {!DEMO && (
          <section aria-labelledby="usdc-title" className="flex flex-col gap-2">
          <h2 id="usdc-title" className="text-lg font-semibold">
            {t('walletScreen.getUsdc')}
          </h2>
          <p className="text-muted">{t('walletScreen.getUsdcBody')}</p>
          <a
            href={USDC_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1 font-medium underline underline-offset-4"
          >
            {t('walletScreen.openFaucet')} <IconExternal size={16} />
            <span className="sr-only">{t('common.opensNewTab')}</span>
          </a>
        </section>
        )}

        <section aria-labelledby="rates-title" className="flex flex-col gap-2">
          <h2 id="rates-title" className="text-lg font-semibold">
            {t('walletScreen.ratesTitle')}
          </h2>
          <p className="text-muted">
            {rates.source === 'live' && rates.updatedAt
              ? t('walletScreen.ratesLive', { date: formatDate(rates.updatedAt) })
              : t('walletScreen.ratesFixed')}
          </p>
          {rates.source === 'live' && (
            <a href={RATES_ATTRIBUTION_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium underline underline-offset-4">
              {t('walletScreen.ratesBy')} <IconExternal size={14} />
              <span className="sr-only">{t('common.opensNewTab')}</span>
            </a>
          )}
        </section>

        <section aria-labelledby="look-title" className="flex flex-col gap-4">
          <h2 id="look-title" className="text-lg font-semibold">
            {t('walletScreen.appearance')}
          </h2>
          <Segmented
            label={t('walletScreen.theme')}
            value={theme}
            onChange={(next) => next !== theme && toggleTheme()}
            options={[
              { value: 'dark', label: t('walletScreen.themeDark') },
              { value: 'light', label: t('walletScreen.themeLight') },
            ]}
          />
          <div role="group" aria-label={t('walletScreen.accent')} className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <Chip key={a} selected={a === accent} onClick={() => setAccent(a)}>
                <span aria-hidden="true" className="size-4 rounded-full border border-line" style={{ background: `var(--swatch-${a})` }} />
                {t(`accent.${a}`)}
              </Chip>
            ))}
          </div>
        </section>

        <section aria-labelledby="lang-title" className="flex flex-col gap-3">
          <h2 id="lang-title" className="text-lg font-semibold">
            {t('lang.label')}
          </h2>
          <LanguagePicker />
        </section>

        <p className="text-sm text-muted">{t('walletScreen.switchHint')}</p>
        <Button
          variant="outline"
          block
          onClick={() => {
            wallet.disconnect();
            navigate('/', { replace: true });
          }}
        >
          {DEMO ? t('demo.exit') : t('walletScreen.disconnect')}
        </Button>
      </div>
    </>
  );
}

/** @param {{ balances: any, error: boolean, onRetry: () => void, onFund: () => void, funding: boolean }} props */
function Balances({ balances, error, onRetry, onFund, funding }) {
  const { t } = useT();
  if (error) {
    return (
      <Card tone="outline" role="alert" className="flex flex-col gap-3">
        <p>{t('walletScreen.balancesError')}</p>
        <Button variant="secondary" onClick={onRetry}>
          {t('common.tryAgain')}
        </Button>
      </Card>
    );
  }
  if (!balances) {
    return (
      <Card role="status" className="text-muted">
        {t('walletScreen.balancesLoading')}
      </Card>
    );
  }
  if (!balances.funded) {
    return (
      <Card tone="outline" className="flex flex-col gap-3">
        <p className="font-medium">{t('walletScreen.notOnTestnet')}</p>
        <p className="text-muted">{t('walletScreen.fundHint')}</p>
        <Button variant="secondary" loading={funding} onClick={onFund}>
          {t('walletScreen.fund')}
        </Button>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col divide-y divide-line py-2">
      <BalanceRow code="USDC" value={balances.usdc} empty={t('walletScreen.noTrustline')} />
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
