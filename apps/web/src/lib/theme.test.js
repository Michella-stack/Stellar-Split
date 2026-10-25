import { describe, expect, it } from 'vitest';
import { resolveAccent, resolveTheme } from './theme.js';

describe('resolveTheme', () => {
  it('defaults to dark', () => {
    expect(resolveTheme(null, false)).toBe('dark');
  });

  it('follows a light system preference on first load', () => {
    expect(resolveTheme(null, true)).toBe('light');
  });

  it('keeps a saved choice over the system preference', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('ignores unknown saved values', () => {
    expect(resolveTheme('blue', false)).toBe('dark');
  });
});

describe('resolveAccent', () => {
  it('accepts the four accents and falls back to lime', () => {
    expect(resolveAccent('violet')).toBe('violet');
    expect(resolveAccent(null)).toBe('lime');
    expect(resolveAccent('pink')).toBe('lime');
  });
});
