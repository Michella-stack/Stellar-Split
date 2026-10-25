// Where the API session lives in the browser. localStorage, so every tab shares one sign-in and it survives
// closing the browser until the API's own expiry. Only the API session token is stored: never a key.
// Dropped on Disconnect, on an account change and when it expires.

export const SESSION_KEY = 'stellar-split.session';

/** @param {() => Storage | null} getStorage */
export function createSessionStore(getStorage, now = () => Date.now()) {
  const storage = () => {
    try {
      return getStorage();
    } catch {
      return null;
    }
  };

  return {
    /**
     * The saved session for `address`, or null when there is none, it belongs to another account or it expired.
     * @param {string} address
     */
    read(address) {
      try {
        const saved = JSON.parse(storage()?.getItem(SESSION_KEY) ?? 'null');
        if (!saved || saved.address !== address || !(Date.parse(saved.expiresAt) > now())) return null;
        return saved;
      } catch {
        return null;
      }
    },

    /** @param {{ token: string, address: string, expiresAt: string } | null} session */
    write(session) {
      try {
        if (session) storage()?.setItem(SESSION_KEY, JSON.stringify(session));
        else storage()?.removeItem(SESSION_KEY);
      } catch {
        // Storage blocked: the session lasts until reload.
      }
    },
  };
}

export const sessionStore = createSessionStore(() => window.localStorage);
