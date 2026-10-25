import { useCallback, useMemo, useState } from 'react';
import { I18nContext } from './i18n-context.js';
import { initialLang, setLang as applyLang } from './state.js';
import { DICTIONARIES } from './state.js';
import { createTranslator } from './translate.js';

// The module language must be right before the first render, because formatters read it while rendering.
const firstLang = initialLang();
applyLang(firstLang, { remember: false });

/**
 * Provides the language, `t` and `setLang`. Changing the language re-renders every screen that calls useT().
 * @param {{ children: import('react').ReactNode }} props
 */
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(firstLang);

  const setLang = useCallback((next) => {
    applyLang(next); // module state first, so formatters used during the next render see the new language
    setLangState(next);
  }, []);

  const value = useMemo(() => ({ lang, setLang, t: createTranslator(DICTIONARIES, lang) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
