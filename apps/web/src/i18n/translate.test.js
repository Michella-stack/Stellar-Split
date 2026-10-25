import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './messages/en.js';
import es from './messages/es.js';
import pt from './messages/pt.js';
import { createTranslator, detectLang, placeholders } from './translate.js';

const DICTIONARIES = { en, es, pt };

describe('message files', () => {
  it('have the same keys in every language', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
  });

  it('use the same placeholders as English and are never empty', () => {
    for (const [key, message] of Object.entries(en)) {
      for (const dict of [es, pt]) {
        expect(dict[key], key).toBeTruthy();
        expect(placeholders(dict[key]), key).toEqual(placeholders(message));
      }
    }
  });

  it('define every key the code asks for by name', () => {
    const missing = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(jsx?|js)$/.test(name) && !name.includes('.test.')) {
          const source = readFileSync(path, 'utf8');
          for (const m of source.matchAll(/\b(?:t|tNow)\(\s*'([a-zA-Z]+(?:\.[a-zA-Z_]+)+)'/g)) {
            const key = m[1];
            if (!(key in en) && !(`${key}_other` in en)) missing.push(`${name}: ${key}`);
          }
        }
      }
    };
    walk(new URL('..', import.meta.url).pathname);
    expect(missing).toEqual([]);
  });
});

describe('createTranslator', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    const t = createTranslator({ en: { hi: 'Hi {name}, {other}' } }, 'en');
    expect(t('hi', { name: 'Ana' })).toBe('Hi Ana, {other}');
  });

  it('picks plural forms', () => {
    const t = createTranslator(DICTIONARIES, 'es');
    expect(t('chat.expenseSplit', { count: 1 })).toContain('1 persona');
    expect(t('chat.expenseSplit', { count: 4 })).toContain('4 personas');
  });

  it('falls back to English, then to the key', () => {
    const t = createTranslator({ en: { only: 'English only' }, es: {} }, 'es');
    expect(t('only')).toBe('English only');
    expect(t('nothing.here')).toBe('nothing.here');
  });
});

describe('detectLang', () => {
  it('prefers a saved choice, then the browser, then English', () => {
    expect(detectLang('pt', ['es-MX'])).toBe('pt');
    expect(detectLang(null, ['fr-FR', 'es-MX'])).toBe('es');
    expect(detectLang('xx', ['de'])).toBe('en');
    expect(detectLang(undefined)).toBe('en');
  });
});
