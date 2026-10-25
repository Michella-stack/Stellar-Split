import { Pill } from '../../components/Pill.jsx';
import { useT } from '../../hooks/useT.js';

/** @param {{ type: 'flat' | 'trip' | 'other' }} props */
export function GroupTypePill({ type }) {
  const { t } = useT();
  return <Pill tone="solid">{t(`groupType.${['flat', 'trip'].includes(type) ? type : 'other'}`)}</Pill>;
}
