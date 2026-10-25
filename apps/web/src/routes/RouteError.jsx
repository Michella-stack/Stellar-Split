import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { useT } from '../hooks/useT.js';

export default function RouteError() {
  const { t } = useT();
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-4 px-4">
      <h1 className="font-display-wide text-4xl">{notFound ? t('error.notFoundTitle') : t('error.genericTitle')}</h1>
      <p className="text-muted">
        {notFound ? t('error.notFoundBody') : t('error.genericBody')}
      </p>
      <Link to="/" className="flex min-h-11 items-center underline">
        {t('error.backToStart')}
      </Link>
    </main>
  );
}
