// The language in use, readable from plain code (formatters, scripted replies) as well as from React.

import en from './messages/en.js';
import es from './messages/es.js';
import pt from './messages/pt.js';
import { DEFAULT_LANG, LOCALES, NUMBER_SEPARATORS, createTranslator, detectLang } from './translate.js';

export const DICTIONARIES = { en, es, pt };
export const LANG_KEY = 'stellar-split.lang';

let current = /** @type {'en' | 'es' | 'pt'} */ (DEFAULT_LANG);
let translator = createTranslator(DICTIONARIES, current);

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The language the person chose, or the one their browser asks for. */
export function initialLang() {
  let stored = null;
  try {
    stored = storage()?.getItem(LANG_KEY) ?? null;
  } catch {
    // Blocked storage: use the browser language.
  }
  return detectLang(stored, typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]));
}

/** @returns {'en' | 'es' | 'pt'} */
export function getLang() {
  return current;
}

/**
 * Switches the language everywhere, including code that is not a component.
 * @param {'en' | 'es' | 'pt'} lang
 * @param {{ remember?: boolean }} [options]
 */
export function setLang(lang, { remember = true } = {}) {
  current = lang;
  translator = createTranslator(DICTIONARIES, lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  if (remember) {
    try {
      storage()?.setItem(LANG_KEY, lang);
    } catch {
      // Blocked storage: the choice lasts for this page view.
    }
  }
}

/** Translates with the current language. For code outside React components. */
export function tNow(/** @type {string} */ key, /** @type {Record<string, string | number> | undefined} */ params) {
  return translator(key, params);
}

/** Locale for dates, e.g. "en-GB". */
export function currentLocale() {
  return LOCALES[current];
}

/** Separators for amounts in the current language. */
export function currentSeparators() {
  return NUMBER_SEPARATORS[current];
}
