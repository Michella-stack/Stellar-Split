import { useT } from '../hooks/useT.js';
import { useTheme } from '../hooks/useTheme.js';
import { IconButton } from './IconButton.jsx';
import { IconMoon, IconSun } from './icons.jsx';

/** Switches between dark and light. Lives in Wallet settings; also used on the UI kit page. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useT();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <IconButton label={t('common.useTheme', { theme: t(`common.theme.${next}`) })} onClick={toggleTheme}>
      {theme === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
    </IconButton>
  );
}
