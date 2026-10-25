import { ASSIST_PREVIEW } from '../../client/api.js';
import { useT } from '../../hooks/useT.js';

/** Says plainly that Stellar Assist runs on sample data while its API does not exist yet. */
export function PreviewNote() {
  const { t } = useT();
  if (!ASSIST_PREVIEW) return null;
  return (
    <p className="rounded-2xl border-2 border-dashed border-line px-4 py-3 text-sm">
      <strong>{t('agent.previewTitle')}</strong> {t('agent.previewBody')}
    </p>
  );
}
