import { useContext } from 'react';
import { I18nContext } from '../i18n/i18n-context.js';

/** `t(key, params)` for the current language, plus `lang` and `setLang`. */
export function useT() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useT must be used inside <I18nProvider>');
  return value;
}
