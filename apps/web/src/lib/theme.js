// Theme and accent preferences. public/theme-init.js applies the same rules before first paint.

export const THEMES = /** @type {const} */ (['dark', 'light']);
export const ACCENTS = /** @type {const} */ (['lime', 'cyan', 'orange', 'violet']);
export const DEFAULT_ACCENT = 'lime';

const THEME_KEY = 'stellar-split.theme';
const ACCENT_KEY = 'stellar-split.accent';

/**
 * Picks the theme to show: a saved choice wins, otherwise light only when the system asks for it.
 * @param {string | null} stored
 * @param {boolean} systemPrefersLight
 * @returns {'dark' | 'light'}
 */
export function resolveTheme(stored, systemPrefersLight) {
  if (stored === 'dark' || stored === 'light') return stored;
  return systemPrefersLight ? 'light' : 'dark';
}

/**
 * @param {string | null} stored
 * @returns {'lime' | 'cyan' | 'orange' | 'violet'}
 */
export function resolveAccent(stored) {
  return ACCENTS.includes(/** @type {any} */ (stored)) ? /** @type {any} */ (stored) : DEFAULT_ACCENT;
}

/** @param {string} key */
function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** @param {string} key @param {string} value */
function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts for this page view only.
  }
}

/** @returns {'dark' | 'light'} the theme currently applied to the document */
export function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** @returns {'lime' | 'cyan' | 'orange' | 'violet'} */
export function currentAccent() {
  return resolveAccent(document.documentElement.dataset.accent ?? read(ACCENT_KEY));
}

/**
 * Applies and remembers a theme.
 * @param {'dark' | 'light'} theme
 */
export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  write(THEME_KEY, theme);
}

/**
 * Applies and remembers an accent colour.
 * @param {'lime' | 'cyan' | 'orange' | 'violet'} accent
 */
export function setAccent(accent) {
  document.documentElement.dataset.accent = accent;
  write(ACCENT_KEY, accent);
}
