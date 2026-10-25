import { useContext } from 'react';
import { WalletContext } from '../wallets/wallet-context.js';

/** Wallet, session and profile state. Components never import Freighter directly. */
export function useWallet() {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error('useWallet must be used inside <WalletProvider>');
  return wallet;
}
