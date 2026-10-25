import { TopBar } from './TopBar.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

/**
 * Temporary body for a screen that is not built yet. Removed screen by screen in later phases.
 * @param {{ title: string, screen: string, backTo?: string, children?: import('react').ReactNode }} props
 */
export function ScreenPlaceholder({ title, screen, backTo, children }) {
  return (
    <>
      <TopBar backTo={backTo} action={<ThemeToggle />} />
      <section aria-labelledby="screen-title" className="flex flex-col gap-4 py-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">{screen}</p>
        <h1 id="screen-title" className="font-display-wide text-4xl">
          {title}
        </h1>
        <p className="text-muted">This screen is a placeholder.</p>
        {children}
      </section>
    </>
  );
}
