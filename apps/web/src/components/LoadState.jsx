import { Button } from './Button.jsx';
import { Card } from './Card.jsx';

/** Placeholder shown while a screen loads. @param {{ label?: string }} props */
export function Loading({ label = 'Loading…' }) {
  return (
    <div role="status" className="flex flex-col gap-3 py-6">
      <span className="sr-only">{label}</span>
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
export function LoadError({ title = 'Could not load this', error, onRetry }) {
  const offline = error?.code === 'NETWORK' || error?.code === 'TIMEOUT';
  return (
    <Card tone="outline" role="alert" className="my-6 flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted">{offline ? 'Check your connection and try again.' : error?.code === 'NOT_FOUND' ? 'It may have been removed, or you are not a member.' : 'Something went wrong. Try again.'}</p>
      {onRetry && error?.code !== 'NOT_FOUND' && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}
