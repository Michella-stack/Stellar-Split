import { createContext } from 'react';

/**
 * @typedef {{
 *   status: 'checking' | 'disconnected' | 'connecting' | 'connected',
 *   address: string | null,
 *   network: import('./freighter/adapter.js').WalletNetwork | null,
 *   session: { token: string, address: string, expiresAt: string } | null,
 *   profile: { address: string, displayName: string | null, homeCurrency: string | null, email: string | null } | null,
 *   error: import('./freighter/errors.js').WalletErrorCode | null,
 *   epoch: number,
 *   connect: () => Promise<boolean>,
 *   signIn: () => Promise<boolean>,
 *   saveProfile: (patch: object) => Promise<void>,
 *   disconnect: () => void,
 *   clearError: () => void,
 *   recheckNetwork: () => Promise<void>,
 *   sign: (xdr: string, intent: import('./freighter/intent.js').SigningIntent) => Promise<{ signedXdr: string, signer: string }>,
 *   signMessage: (message: string, intent: import('./freighter/adapter.js').MessageIntent) => Promise<{ signature: string, signer: string }>,
 * }} WalletState
 * `epoch` increases on every account or network change; a payment reviewed under an older epoch must be reviewed again.
 */

/** @type {import('react').Context<WalletState | null>} */
export const WalletContext = createContext(null);
