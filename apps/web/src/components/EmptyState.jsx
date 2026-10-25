/**
 * Shown when a list has nothing in it yet.
 * @param {{ icon?: import('react').ReactNode, title: string, children?: import('react').ReactNode, action?: import('react').ReactNode }} props
 */
export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-6 py-10 text-center">
      {icon && <span className="flex size-14 items-center justify-center rounded-full bg-surface-2 text-muted">{icon}</span>}
      <h2 className="font-display-wide text-xl">{title}</h2>
      {children && <p className="max-w-[32ch] text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
