import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { IconAlert, IconExternal } from '../../components/icons.jsx';
import { FREIGHTER_INSTALL_URL } from '../../config/env.js';

const COPY = {
  NOT_INSTALLED: {
    title: 'Freighter is not installed',
    body: 'Stellar Split uses the free Freighter browser extension to hold your keys. Install it, create or import a wallet, then come back.',
  },
  LOCKED: {
    title: 'Freighter is locked',
    body: 'Open Freighter from your browser toolbar, unlock it with your password, then try again.',
  },
  USER_REJECTED: {
    title: 'Request closed',
    body: 'You closed the Freighter window, so nothing happened. Try again when you are ready.',
  },
  WRONG_NETWORK: {
    title: 'Switch Freighter to Testnet',
    body: 'Stellar Split only runs on Stellar Testnet, where no real money is used.',
  },
  ACCOUNT_CHANGED: {
    title: 'Your Freighter account changed',
    body: 'Sign in again with the account you want to use.',
  },
  UNKNOWN: {
    title: 'Something went wrong with Freighter',
    body: 'Try again. If it keeps happening, reload the page.',
  },
};

/**
 * One card for every wallet problem, with a clear next step.
 * @param {{ code: keyof typeof COPY | 'INTENT_MISMATCH', onRetry?: () => void, retryLabel?: string }} props
 */
export function WalletProblem({ code, onRetry, retryLabel = 'Try again' }) {
  const copy = COPY[code] ?? COPY.UNKNOWN;
  return (
    <Card tone="outline" className="flex flex-col gap-4" role="alert">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-owe">
          <IconAlert />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{copy.title}</h2>
          <p className="text-muted">{copy.body}</p>
        </div>
      </div>
      {code === 'WRONG_NETWORK' && (
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Open Freighter from your browser toolbar.</li>
          <li>Tap the network name at the top (it may say “Mainnet”).</li>
          <li>Choose “Test Net”.</li>
          <li>Come back here and check again.</li>
        </ol>
      )}
      {code === 'NOT_INSTALLED' ? (
        <a
          href={FREIGHTER_INSTALL_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-on-primary"
        >
          Get Freighter <IconExternal size={18} />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : (
        onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            {code === 'WRONG_NETWORK' ? 'I switched, check again' : retryLabel}
          </Button>
        )
      )}
    </Card>
  );
}
