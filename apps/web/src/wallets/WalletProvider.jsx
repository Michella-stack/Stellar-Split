import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../client/api.js';
import * as freighter from './freighter/adapter.js';
import { WalletError } from './freighter/errors.js';
import { WalletContext } from './wallet-context.js';

const errorCode = (error) => (error instanceof WalletError ? error.code : 'UNKNOWN');

/**
 * Holds the connected Freighter account, its network, the API session and the profile.
 * The session token lives in memory only, so a reload asks for a new sign-in signature.
 * @param {{ children: import('react').ReactNode }} props
 */
export function WalletProvider({ children }) {
  const [status, setStatus] = useState(/** @type {'checking' | 'disconnected' | 'connecting' | 'connected'} */ ('checking'));
  const [address, setAddressState] = useState(/** @type {string | null} */ (null));
  const [network, setNetworkState] = useState(/** @type {any} */ (null));
  const [session, setSession] = useState(/** @type {any} */ (null));
  const [profile, setProfile] = useState(/** @type {any} */ (null));
  const [error, setError] = useState(/** @type {any} */ (null));
  const [epoch, setEpoch] = useState(0);
  // Refs mirror the latest values for callbacks and the Freighter watcher.
  const addressRef = useRef(/** @type {string | null} */ (null));
  const networkRef = useRef(/** @type {any} */ (null));
  const setAddress = useCallback((next) => {
    addressRef.current = next;
    setAddressState(next);
  }, []);
  const setNetwork = useCallback((next) => {
    networkRef.current = next;
    setNetworkState(next);
  }, []);

  const forgetSession = useCallback(() => {
    api.setSessionToken(null);
    setSession(null);
    setProfile(null);
  }, []);

  // Restore a connection the person already allowed, without opening Freighter.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await freighter.getConnectedAddress();
        if (cancelled) return;
        if (!existing) return setStatus('disconnected');
        const net = await freighter.getNetwork();
        if (cancelled) return;
        setAddress(existing);
        setNetwork(net);
        setStatus('connected');
      } catch {
        if (!cancelled) setStatus('disconnected');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAddress, setNetwork]);

  // Account or network changes in Freighter invalidate anything reviewed earlier.
  useEffect(() => {
    if (status !== 'connected') return undefined;
    return freighter.watch(({ address: next, network: nextNetwork }) => {
      if (next && next !== addressRef.current) {
        forgetSession();
        setAddress(next);
        setEpoch((e) => e + 1);
      }
      if (nextNetwork && networkRef.current?.passphrase !== nextNetwork.passphrase) {
        setNetwork(nextNetwork);
        setEpoch((e) => e + 1);
      }
    });
  }, [status, forgetSession, setAddress, setNetwork]);

  const connect = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      const result = await freighter.connect();
      if (result.address !== addressRef.current) forgetSession();
      setAddress(result.address);
      setNetwork(result.network);
      setStatus('connected');
      if (!result.network.isTestnet) {
        setError('WRONG_NETWORK');
        return false;
      }
      return true;
    } catch (e) {
      setError(errorCode(e));
      setStatus(addressRef.current ? 'connected' : 'disconnected');
      return false;
    }
  }, [forgetSession, setAddress, setNetwork]);

  const recheckNetwork = useCallback(async () => {
    try {
      const net = await freighter.getNetwork();
      setNetwork(net);
      setError(net.isTestnet ? null : 'WRONG_NETWORK');
    } catch (e) {
      setError(errorCode(e));
    }
  }, [setNetwork]);

  const sign = useCallback((xdr, intent) => freighter.signTransaction(xdr, intent), []);

  const signIn = useCallback(async () => {
    const current = addressRef.current;
    if (!current) return false;
    setError(null);
    try {
      const { challengeXdr } = await api.requestChallenge({ address: current });
      const { signedXdr } = await freighter.signTransaction(challengeXdr, { kind: 'sign-in', signer: current });
      const { session: next } = await api.verifyChallenge({ signedXdr });
      api.setSessionToken(next.token);
      setSession(next);
      setProfile(await api.getMe());
      return true;
    } catch (e) {
      setError(e instanceof WalletError ? e.code : 'UNKNOWN');
      return false;
    }
  }, []);

  const saveProfile = useCallback(async (patch) => {
    setProfile(await api.updateMe(patch));
  }, []);

  const disconnect = useCallback(() => {
    // Freighter has no programmatic disconnect; the app forgets the account and session.
    forgetSession();
    setAddress(null);
    setNetwork(null);
    setError(null);
    setStatus('disconnected');
    setEpoch((e) => e + 1);
  }, [forgetSession, setAddress, setNetwork]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ status, address, network, session, profile, error, epoch, connect, signIn, saveProfile, disconnect, clearError, recheckNetwork, sign }),
    [status, address, network, session, profile, error, epoch, connect, signIn, saveProfile, disconnect, clearError, recheckNetwork, sign],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
