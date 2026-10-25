import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

export default function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-4 px-4">
      <h1 className="font-display-wide text-4xl">{notFound ? 'Page not found' : 'Something went wrong'}</h1>
      <p className="text-muted">
        {notFound ? 'This page does not exist.' : 'Reload the page. If it keeps happening, tell the team.'}
      </p>
      <Link to="/" className="flex min-h-11 items-center underline">
        Back to start
      </Link>
    </main>
  );
}
