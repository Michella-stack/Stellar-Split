import { ASSIST_PREVIEW } from '../../client/api.js';

/** Says plainly that Stellar Assist runs on sample data while its API does not exist yet. */
export function PreviewNote() {
  if (!ASSIST_PREVIEW) return null;
  return (
    <p className="rounded-2xl border-2 border-dashed border-line px-4 py-3 text-sm">
      <strong>Preview.</strong> Stellar Assist runs on sample data (Casa Alfama) until its API is ready. Nothing here changes your real
      groups or moves money.
    </p>
  );
}
