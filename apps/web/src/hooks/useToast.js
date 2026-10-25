import { useContext } from 'react';
import { ToastContext } from '../components/toast-context.js';

/** @returns {(message: string, options?: import('../components/toast-context.js').ToastOptions) => void} */
export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}
