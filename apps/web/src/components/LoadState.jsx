import { useT } from '../hooks/useT.js';
import { Button } from './Button.jsx';
import { Card } from './Card.jsx';

/** Placeholder shown while a screen loads. @param {{ label?: string }} props */
export function Loading({ label }) {
  const { t } = useT();
  return (
    <div role="status" className="flex flex-col gap-3 py-6">
      <span className="sr-only">{label ?? t('common.loading')}</span>
      <div aria-hidden="true" className="h-28 animate-pulse rounded-card bg-surface" />
      <div aria-hidden="true" className="h-16 animate-pulse rounded-card bg-surface" />
      <div aria-hidden="true" className="h-16 animate-pulse rounded-card bg-surface" />
    </div>
  );
}

/**
 * Error card with a retry button.
 * @param {{ title?: string, error?: { code?: string } | null, onRetry?: () => void }} props
 */
export function LoadError({ title, error, onRetry }) {
  const { t } = useT();
  const offline = error?.code === 'NETWORK' || error?.code === 'TIMEOUT';
  return (
    <Card tone="outline" role="alert" className="my-6 flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title ?? t('loadError.title')}</h2>
      <p className="text-muted">{offline ? t('loadError.offline') : error?.code === 'NOT_FOUND' ? t('loadError.notFound') : t('loadError.generic')}</p>
      {onRetry && error?.code !== 'NOT_FOUND' && (
        <Button variant="secondary" onClick={onRetry}>
          {t('common.tryAgain')}
        </Button>
      )}
    </Card>
  );
}
