import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../client/api.js';
import * as freighter from './freighter/adapter.js';
import { WalletError } from './freighter/errors.js';
import { WalletContext } from './wallet-context.js';
import { SESSION_KEY, sessionStore } from './sessionStore.js';
import { DEMO, DEMO_ADDRESS, exitDemo } from '../lib/demoMode.js';

const errorCode = (error) => (error instanceof WalletError ? error.code : 'UNKNOWN');

// Set when the person presses Disconnect, so the app does not silently reconnect on the next visit
// (Freighter keeps the site allowed). Cleared by the next explicit Connect.
const DISCONNECTED_KEY = 'stellar-split.disconnected';

function setDisconnectedFlag(on) {
  try {
    if (on) window.localStorage.setItem(DISCONNECTED_KEY, '1');
    else window.localStorage.removeItem(DISCONNECTED_KEY);
  } catch {
    // Storage blocked: Disconnect lasts until reload.
  }
}

function wasDisconnected() {
  try {
    return window.localStorage.getItem(DISCONNECTED_KEY) === '1';
  } catch {
    return false;
  }
}


/**
 * Holds the connected Freighter account, its network, the API session and the profile.
 * The API session is kept in localStorage (sessionStore.js), so every tab shares one sign-in until it expires.
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
    sessionStore.write(null);
    api.setSessionToken(null);
    setSession(null);
    setProfile(null);
  }, []);

  // Restore a connection the person already allowed, without opening Freighter.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (DEMO) {
        // Demo mode: the sample person is signed in from the start. Freighter is never contacted.
        try {
          const me = await api.getMe();
          if (cancelled) return;
          setAddress(DEMO_ADDRESS);
          setNetwork({ name: 'testnet', passphrase: 'Test SDF Network ; September 2015', isTestnet: true });
          setSession({ token: 'demo', address: DEMO_ADDRESS, expiresAt: '2999-01-01T00:00:00.000Z' });
          setProfile(me);
          setStatus('connected');
        } catch {
          if (!cancelled) setStatus('disconnected');
        }
        return;
      }
      try {
        if (wasDisconnected()) return setStatus('disconnected');
        const existing = await freighter.getConnectedAddress();
        if (cancelled) return;
        if (!existing) return setStatus('disconnected');
        const net = await freighter.getNetwork();
        if (cancelled) return;
        setAddress(existing);
        setNetwork(net);
        const saved = sessionStore.read(existing);
        if (saved) {
          api.setSessionToken(saved.token);
          try {
            const me = await api.getMe();
            if (cancelled) return;
            setSession(saved);
            setProfile(me);
          } catch {
            sessionStore.write(null);
            api.setSessionToken(null);
          }
        }
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
    if (status !== 'connected' || DEMO) return undefined;
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

  // Another tab disconnected or signed in with a different account: follow it here too.
  useEffect(() => {
    function onStorage(event) {
      if (event.key !== SESSION_KEY || !addressRef.current) return;
      if (!sessionStore.read(addressRef.current)) {
        api.setSessionToken(null);
        setSession(null);
        setProfile(null);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      const result = await freighter.connect();
      setDisconnectedFlag(false);
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

  const sign = useCallback((xdr, intent) => {
    // Demo payments are simulated and never reach this point; refuse so nothing is ever signed by accident.
    if (DEMO) return Promise.reject(new WalletError('UNKNOWN', 'Nothing is signed in demo mode'));
    return freighter.signTransaction(xdr, intent);
  }, []);

  // Demo mode has no wallet to sign with; the mock API accepts any signature.
  const signMessage = useCallback(
    (message, intent) => (DEMO ? Promise.resolve({ signature: 'ZGVtbw==', signer: intent.signer }) : freighter.signMessage(message, intent)),
    [],
  );

  const signIn = useCallback(async () => {
    const current = addressRef.current;
    if (!current) return false;
    setError(null);
    try {
      const { challenge } = await api.requestChallenge({ address: current });
      const { signature } = await freighter.signMessage(challenge, { kind: 'sign-in', signer: current });
      const { session: next } = await api.verifyChallenge({ address: current, challenge, signature });
      api.setSessionToken(next.token);
      sessionStore.write(next);
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
    if (DEMO) {
      exitDemo();
      return;
    }
    // Freighter has no programmatic disconnect; the app forgets the account and session and stays
    // disconnected until the person presses Connect again.
    setDisconnectedFlag(true);
    forgetSession();
    setAddress(null);
    setNetwork(null);
    setError(null);
    setStatus('disconnected');
    setEpoch((e) => e + 1);
  }, [forgetSession, setAddress, setNetwork]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ status, address, network, session, profile, error, epoch, connect, signIn, saveProfile, disconnect, clearError, recheckNetwork, sign, signMessage }),
    [status, address, network, session, profile, error, epoch, connect, signIn, saveProfile, disconnect, clearError, recheckNetwork, sign, signMessage],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
