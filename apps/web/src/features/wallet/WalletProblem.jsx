import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { IconAlert, IconExternal } from '../../components/icons.jsx';
import { FREIGHTER_INSTALL_URL } from '../../config/env.js';
import { useT } from '../../hooks/useT.js';

// Texts live in i18n/messages as wp.<CODE>.title and wp.<CODE>.body. Unknown codes use UNKNOWN.
const CODES = ['NOT_INSTALLED', 'LOCKED', 'USER_REJECTED', 'WRONG_NETWORK', 'ACCOUNT_CHANGED', 'UNKNOWN'];

/**
 * One card for every wallet problem, with a clear next step.
 * @param {{ code: string, onRetry?: () => void, retryLabel?: string }} props
 */
export function WalletProblem({ code, onRetry, retryLabel }) {
  const { t } = useT();
  const key = CODES.includes(code) ? code : 'UNKNOWN';
  return (
    <Card tone="outline" className="flex flex-col gap-4" role="alert">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-owe">
          <IconAlert />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t(`wp.${key}.title`)}</h2>
          <p className="text-muted">{t(`wp.${key}.body`)}</p>
        </div>
      </div>
      {code === 'WRONG_NETWORK' && (
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>{t('wp.step1')}</li>
          <li>{t('wp.step2')}</li>
          <li>{t('wp.step3')}</li>
          <li>{t('wp.step4')}</li>
        </ol>
      )}
      {code === 'NOT_INSTALLED' ? (
        <a
          href={FREIGHTER_INSTALL_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-on-primary"
        >
          {t('wp.getFreighter')} <IconExternal size={18} />
          <span className="sr-only">{t('common.opensNewTab')}</span>
        </a>
      ) : (
        onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            {code === 'WRONG_NETWORK' ? t('wp.switched') : (retryLabel ?? t('common.tryAgain'))}
          </Button>
        )
      )}
    </Card>
  );
}
