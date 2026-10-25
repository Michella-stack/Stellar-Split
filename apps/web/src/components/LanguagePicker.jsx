import { useT } from '../hooks/useT.js';
import { LANGS, LANG_LABELS } from '../i18n/translate.js';
import { Chip } from './Chip.jsx';

/**
 * Chooses the language of the app. Each language is written in itself, so it can be found whatever the current one is.
 * @param {{ className?: string }} props
 */
export function LanguagePicker({ className }) {
  const { t, lang, setLang } = useT();
  return (
    <div role="group" aria-label={t('lang.label')} className={`flex flex-wrap gap-2 ${className ?? ''}`}>
      {LANGS.map((code) => (
        <Chip key={code} selected={code === lang} onClick={() => setLang(code)} lang={code}>
          {LANG_LABELS[code]}
        </Chip>
      ))}
    </div>
  );
}
