import { createContext } from 'react';

/** @typedef {{ tone?: 'info' | 'success' | 'error' }} ToastOptions */

/** @type {import('react').Context<((message: string, options?: ToastOptions) => void) | null>} */
export const ToastContext = createContext(null);
