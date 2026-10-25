import { useEffect, useId, useRef } from 'react';
import { IconButton } from './IconButton.jsx';
import { IconClose } from './icons.jsx';

/**
 * Bottom sheet on a native modal <dialog>: focus is trapped, Escape closes it and focus returns to the opener.
 * @param {{ open: boolean, onClose: () => void, title: string, children: import('react').ReactNode }} props
 */
export function Sheet({ open, onClose, title, children }) {
  const ref = useRef(/** @type {HTMLDialogElement | null} */ (null));
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-0 mx-auto mt-auto w-full max-w-[480px] max-h-[90dvh] animate-sheet-in rounded-t-[28px] bg-surface p-0 text-text"
    >
      <div className="flex flex-col gap-4 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <span aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-line" />
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-display-wide text-2xl">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <IconClose size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
