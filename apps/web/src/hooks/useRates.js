import { useCallback, useSyncExternalStore } from 'react';
import { estimate, getRates, subscribeRates } from '../lib/rates.js';

/** The rates in use (fixed or live). Re-renders when live rates arrive. */
export function useRates() {
  return useSyncExternalStore(subscribeRates, getRates);
}

/**
 * `estimate(usdc, currency)` bound to the current rates, so a screen redraws its estimates when live rates arrive.
 * @returns {(usdc: string, currency: string) => string | null}
 */
export function useEstimate() {
  const { rates } = useRates();
  return useCallback((usdc, currency) => estimate(usdc, currency, rates), [rates]);
}
