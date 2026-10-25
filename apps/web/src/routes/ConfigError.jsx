/**
 * Shown instead of the app when the configuration is not Stellar Testnet. The app fails closed.
 * @param {{ problems: string[] }} props
 */
export default function ConfigError({ problems }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-4 px-4">
      <h1 className="font-display-wide text-3xl">Configuration problem</h1>
      <p className="text-muted">Stellar Split refuses to start because its settings are not for Stellar Testnet.</p>
      <ul className="ml-5 list-disc space-y-2">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        Copy <code className="font-mono">apps/web/.env.example</code> to <code className="font-mono">.env</code> and restart the dev server.
      </p>
    </main>
  );
}
