// WCAG 2.1 AA check on the theme tokens in app.css: every text/background pair the UI uses must reach 4.5:1.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

/** Reads `--name: #hex` declarations from the first block whose selector matches. */
function tokens(selectorPattern) {
  const block = new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, k, v]) => [k, v.toLowerCase()]));
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `amount` of `top` over `base`, like Tailwind's bg-owe/10. */
const mix = (base, top, amount) =>
  '#' + rgb(base).map((c, i) => Math.round(c * (1 - amount) + rgb(top)[i] * amount).toString(16).padStart(2, '0')).join('');

const dark = tokens(":root,\\s*\\[data-theme='dark'\\]");
const light = tokens("\\[data-theme='light'\\]");
const accents = { lime: tokens(':root')['accent'], ...Object.fromEntries(['cyan', 'orange', 'violet'].map((a) => [a, tokens(`\\[data-accent='${a}'\\]`).accent])) };
const ON_ACCENT = '#0b0b0d';

describe.each([
  ['dark', dark],
  ['light', light],
])('%s theme', (_, t) => {
  const pairs = [
    ['text', 'bg'], ['text', 'surface'], ['text', 'surface-2'],
    ['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'],
    ['owe', 'bg'], ['owe', 'surface'], ['owed', 'bg'], ['owed', 'surface'],
  ];
  it.each(pairs)('%s on %s ≥ 4.5', (fg, bg) => {
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('owe and owed text on their tinted summary tiles ≥ 4.5', () => {
    expect(ratio(t.owe, mix(t.bg, t.owe, 0.1))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t.owed, mix(t.bg, t.owed, 0.1))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('accent fills', () => {
  it.each(Object.entries(accents))('dark text on %s ≥ 4.5', (_, hex) => {
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(ratio(ON_ACCENT, hex)).toBeGreaterThanOrEqual(4.5);
  });

  it('light-theme primary button (white on near-black) ≥ 4.5', () => {
    expect(ratio(light['primary-fg'] ?? '#ffffff', light.text)).toBeGreaterThanOrEqual(4.5);
  });
});
