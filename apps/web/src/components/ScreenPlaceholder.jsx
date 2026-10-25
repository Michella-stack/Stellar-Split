/**
 * Temporary body for a screen that is not built yet. Removed screen by screen in later phases.
 * @param {{ title: string, screen: string, children?: import('react').ReactNode }} props
 */
export function ScreenPlaceholder({ title, screen, children }) {
  return (
    <section aria-labelledby="screen-title" className="flex flex-col gap-4 py-8">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">{screen}</p>
      <h1 id="screen-title" className="font-display-wide text-4xl">
        {title}
      </h1>
      <p className="text-muted">This screen is a placeholder.</p>
      {children}
    </section>
  );
}
