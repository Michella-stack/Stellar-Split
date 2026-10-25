import { EXPLORER_ACCOUNT_URL } from '../config/env.js';
import { useT } from '../hooks/useT.js';
import { DEMO } from '../lib/demoMode.js';
import { shortAddress } from '../lib/format.js';
import { cx } from '../lib/cx.js';
import { IconExternal } from './icons.jsx';

/**
 * A Stellar address, shortened, that opens the account on the explorer. In demo mode the addresses are sample ones
 * that do not exist on Stellar, so it is plain text.
 * @param {{ address: string, className?: string }} props
 */
export function AddressLink({ address, className }) {
  const { t } = useT();
  const classes = cx('font-mono', className);
  if (DEMO) {
    return (
      <span className={classes} title={address}>
        {shortAddress(address)}
      </span>
    );
  }
  return (
    <a
      href={`${EXPLORER_ACCOUNT_URL}${address}`}
      target="_blank"
      rel="noreferrer"
      title={address}
      className={cx(classes, 'inline-flex min-h-11 items-center gap-1 underline underline-offset-4')}
    >
      {shortAddress(address)} <IconExternal size={14} />
      <span className="sr-only">{t('common.viewAccount')}</span>
    </a>
  );
}
