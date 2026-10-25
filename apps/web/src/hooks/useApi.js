import { useCallback, useEffect, useState } from 'react';

/**
 * Loads data from an API function and tracks loading and error state.
 * @template T
 * @param {() => Promise<T>} load called again whenever `key` changes
 * @param {string} key identifies the request, e.g. `group:${id}`
 * @returns {{ data: T | null, error: Error | null, loading: boolean, reload: () => void }}
 */
export function useApi(load, key) {
  const [nonce, setNonce] = useState(0);
  const requestKey = `${key}#${nonce}`;
  const [result, setResult] = useState(/** @type {{ key: string | null, data: any, error: any }} */ ({ key: null, data: null, error: null }));

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => !cancelled && setResult({ key: requestKey, data, error: null }),
      (error) => !cancelled && setResult({ key: requestKey, data: null, error }),
    );
    return () => {
      cancelled = true;
    };
    // `load` is recreated on every render; `requestKey` captures what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = result.key === requestKey;
  return { data: current ? result.data : null, error: current ? result.error : null, loading: !current, reload };
}
