import { useCallback, useState } from 'react';
import { currentAccent, currentTheme, setAccent as applyAccent, setTheme as applyTheme } from '../lib/theme.js';

/**
 * Current theme and accent, with setters that apply and remember them.
 * @returns {{ theme: 'dark' | 'light', toggleTheme: () => void, accent: string, setAccent: (a: any) => void }}
 */
export function useTheme() {
  const [theme, setThemeState] = useState(currentTheme);
  const [accent, setAccentState] = useState(currentAccent);

  const toggleTheme = useCallback(() => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setThemeState(next);
  }, []);

  const setAccent = useCallback((next) => {
    applyAccent(next);
    setAccentState(next);
  }, []);

  return { theme, toggleTheme, accent, setAccent };
}
