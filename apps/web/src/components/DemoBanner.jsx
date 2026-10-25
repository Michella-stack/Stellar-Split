import { useT } from '../hooks/useT.js';
import { DEMO, exitDemo } from '../lib/demoMode.js';

/** Fixed notice shown on every screen in demo mode, with the way out. */
export function DemoBanner() {
  const { t } = useT();
  if (!DEMO) return null;
  return (
    <div role="status" className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-accent px-4 py-2 text-sm font-medium text-on-accent">
      <span>
        {t('demo.banner')}
      </span>
      <button type="button" onClick={exitDemo} className="min-h-11 font-semibold underline underline-offset-4">
        {t('demo.exit')}
      </button>
    </div>
  );
}
