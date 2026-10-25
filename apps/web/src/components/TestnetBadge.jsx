import { useT } from '../hooks/useT.js';
import { Pill } from './Pill.jsx';

/** Shown in the top bar of every screen. */
export function TestnetBadge() {
  const { t } = useT();
  return (
    <Pill mono title={t('common.testnetBadgeTitle')}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-owed" />
      {t('common.testnet')}
    </Pill>
  );
}
