import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../hooks/useT.js';
import { cx } from '../lib/cx.js';
import { ToastContext } from './toast-context.js';
import { IconAlert, IconCheck, IconClose } from './icons.jsx';

const DURATION_MS = 4000;

/**
 * Provides `useToast()` and renders the toast stack. Messages are announced through a polite live region;
 * errors use role="alert".
 * @param {{ children: import('react').ReactNode }} props
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState(/** @type {{ id: number, message: string, tone: string }[]} */ ([]));
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback((message, { tone = 'info' } = {}) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((all) => [...all.slice(-2), { id, message, tone }]);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** @param {{ toast: { id: number, message: string, tone: string }, onDismiss: (id: number) => void }} props */
function ToastItem({ toast, onDismiss }) {
  const { t } = useT();
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'pointer-events-auto flex w-full max-w-[448px] animate-toast-in items-center gap-3 rounded-2xl bg-text py-2 pr-2 pl-4 text-bg shadow-lg',
        toast.tone === 'error' && 'border-l-4 border-owe',
      )}
    >
      {toast.tone === 'success' && <IconCheck size={20} />}
      {toast.tone === 'error' && <IconAlert size={20} />}
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        type="button"
        aria-label={t('common.dismiss')}
        onClick={() => onDismiss(toast.id)}
        className="inline-flex size-11 items-center justify-center rounded-full focus-visible:outline-bg"
      >
        <IconClose size={18} />
      </button>
    </div>
  );
}
