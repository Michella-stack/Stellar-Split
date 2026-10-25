import { Pill } from '../../components/Pill.jsx';

const LABELS = { flat: 'Flat', trip: 'Trip', other: 'Group' };

/** @param {{ type: 'flat' | 'trip' | 'other' }} props */
export function GroupTypePill({ type }) {
  return <Pill tone="solid">{LABELS[type] ?? 'Group'}</Pill>;
}
