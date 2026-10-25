import { Pill } from './Pill.jsx';

/** Shown in the top bar of every screen. */
export function TestnetBadge() {
  return (
    <Pill mono title="Stellar Testnet: no real money">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-owed" />
      Testnet
    </Pill>
  );
}
