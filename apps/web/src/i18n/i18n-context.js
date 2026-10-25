import { createContext } from 'react';

/** @type {import('react').Context<{ lang: 'en' | 'es' | 'pt', setLang: (lang: 'en' | 'es' | 'pt') => void, t: (key: string, params?: Record<string, string | number>) => string } | null>} */
export const I18nContext = createContext(null);
