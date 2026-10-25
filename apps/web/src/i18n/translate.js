// Translation core: no React, no browser. English is the source language and the fallback.

export const LANGS = /** @type {const} */ (['en', 'es', 'pt']);
export const DEFAULT_LANG = 'en';
export const LANG_LABELS = { en: 'English', es: 'Español', pt: 'Português' };

/** BCP 47 locales used for dates. Spanish is the neutral Latin American one; Portuguese is the European one (Lisbon). */
export const LOCALES = { en: 'en-GB', es: 'es-419', pt: 'pt-PT' };

/** Decimal and thousands separators for dollar amounts. */
export const NUMBER_SEPARATORS = {
  en: { group: ',', decimal: '.' },
  es: { group: '.', decimal: ',' },
  pt: { group: '.', decimal: ',' },
};

/**
 * Chooses the language: a saved choice wins, then the browser's languages in order, then English.
 * @param {string | null | undefined} stored
 * @param {readonly string[]} browserLanguages e.g. navigator.languages
 * @returns {'en' | 'es' | 'pt'}
 */
export function detectLang(stored, browserLanguages = []) {
  if (LANGS.includes(/** @type {any} */ (stored))) return /** @type {any} */ (stored);
  for (const tag of browserLanguages) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (LANGS.includes(/** @type {any} */ (base))) return /** @type {any} */ (base);
  }
  return DEFAULT_LANG;
}

/**
 * Builds t(key, params) for one language.
 *
 * - `{name}` in a message is replaced by `params.name`. An unknown placeholder is left as written.
 * - With `params.count`, the message `key_one`, `key_other`, ... is picked by the language's plural rules.
 * - A key missing in the language falls back to English, then to the key itself, so a gap is visible and never blank.
 * @param {Record<string, Record<string, string>>} dictionaries
 * @param {'en' | 'es' | 'pt'} lang
 */
export function createTranslator(dictionaries, lang) {
  const plural = new Intl.PluralRules(LOCALES[lang]);
  const lookup = (key) => dictionaries[lang]?.[key] ?? dictionaries[DEFAULT_LANG]?.[key];

  /** @param {string} key @param {Record<string, string | number>} [params] */
  return function t(key, params) {
    let message;
    if (params && typeof params.count === 'number') {
      message = lookup(`${key}_${plural.select(params.count)}`) ?? lookup(`${key}_other`);
    }
    message ??= lookup(key);
    if (message === undefined) return key;
    return params ? message.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole)) : message;
  };
}

/** The `{name}` placeholders of a message, sorted. Used by the parity test. @param {string} message */
export function placeholders(message) {
  return [...new Set([...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}
