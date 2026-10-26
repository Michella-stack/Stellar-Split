import { useT } from '../hooks/useT.js';
import { Button } from './Button.jsx';
import { Card } from './Card.jsx';

/** One grey block of a skeleton. Stays still for people who ask for less motion. */
function Bone({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-card bg-surface motion-reduce:animate-none ${className}`} />;
}

/** A list row: round avatar, two lines of text and an amount, like ListRow. */
function RowBone() {
  return (
    <div aria-hidden="true" className="flex min-h-16 items-center gap-3 py-2">
      <Bone className="size-11 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Bone className="h-4 w-2/5 rounded-full" />
        <Bone className="h-3 w-3/5 rounded-full" />
      </div>
      <Bone className="h-4 w-14 rounded-full" />
    </div>
  );
}

const SHAPES = {
  // The Groups screen: the totals card, then one card per group.
  groups: () => (
    <>
      <Bone className="h-32" />
      <Bone className="h-24" />
      <Bone className="h-24" />
      <Bone className="h-24" />
    </>
  ),
  // The Group screen: members, the balance card, then the balances list.
  group: () => (
    <>
      <div aria-hidden="true" className="flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex w-16 flex-col items-center gap-2">
            <Bone className="size-12 rounded-full" />
            <Bone className="h-3 w-10 rounded-full" />
          </div>
        ))}
      </div>
      <Bone className="h-36" />
      {[0, 1, 2].map((i) => (
        <RowBone key={i} />
      ))}
    </>
  ),
  // Any list of rows: expenses, activity.
  rows: () => [0, 1, 2, 3, 4].map((i) => <RowBone key={i} />),
};

/**
 * Placeholder shown while a screen loads. `shape` picks a skeleton that looks like the screen it stands in for, so the page
 * does not jump when the data arrives. Without it, three plain blocks.
 * @param {{ label?: string, shape?: keyof typeof SHAPES }} props
 */
export function Loading({ label, shape }) {
  const { t } = useT();
  const Shape = shape ? SHAPES[shape] : null;
  return (
    <div role="status" className="flex flex-col gap-3 py-6">
      <span className="sr-only">{label ?? t('common.loading')}</span>
      {Shape ? (
        <Shape />
      ) : (
        <>
          <Bone className="h-28" />
          <Bone className="h-16" />
          <Bone className="h-16" />
        </>
      )}
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
