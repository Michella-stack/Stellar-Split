// Receipt scan (issue #87). Takes a photo, asks the reader what it shows and returns a draft. It never creates an expense
// and never stores or logs the photo: a person reviews the draft and saves it through the normal expense route.

import { ApiError } from './ledger.js';
import { toDraft } from '../receipts/draft.js';

/** The photo arrives as base64 in JSON. The web app resizes it to well under 1 MB first, so this is a generous ceiling. */
export const MAX_IMAGE_BASE64 = 1_400_000;
export const SCAN_BODY_LIMIT = MAX_IMAGE_BASE64 + 4096;

const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

const invalid = (message, details) => new ApiError(400, 'VALIDATION', message, details);

/**
 * @param {{ extractor?: { extract: Function } | null, ledger: { requireMember: Function }, log?: (line: object) => void, now?: () => number }} deps
 *   Without an extractor (no GEMINI_API_KEY) every scan answers 503 SCAN_UNAVAILABLE and the web app uses its sample result.
 */
export function createReceipts({ extractor = null, ledger, log = () => {}, now = Date.now }) {
  return {
    async scan(principal, groupId, input = {}) {
      // Same answer as a missing group for a non-member, so group ids cannot be probed.
      await ledger.requireMember(principal, groupId);
      if (!extractor) throw new ApiError(503, 'SCAN_UNAVAILABLE', 'The receipt reader is not set up');

      const { imageBase64, mimeType } = input;
      if (!Object.hasOwn(SIGNATURES, mimeType)) throw invalid('mimeType must be image/jpeg, image/png or image/webp');
      if (typeof imageBase64 !== 'string' || imageBase64.length === 0) throw invalid('imageBase64 is required');
      if (imageBase64.length > MAX_IMAGE_BASE64) throw new ApiError(413, 'VALIDATION', 'The photo is too large. Send it smaller.');
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) || imageBase64.length % 4 !== 0) throw invalid('imageBase64 is not valid base64');
      // The bytes must be the kind of image the caller says, so the reader is never handed arbitrary data.
      if (!SIGNATURES[mimeType](Buffer.from(imageBase64.slice(0, 16), 'base64'))) throw invalid('The photo is not a valid image of that type');

      const started = now();
      try {
        const draft = toDraft(await extractor.extract({ mimeType, data: imageBase64 }));
        log({ t: new Date().toISOString(), msg: 'receipt_scan', ok: true, bytes: imageBase64.length, ms: now() - started, warnings: draft.warnings });
        return { draft };
      } catch (err) {
        const code = err instanceof ApiError ? err.code : err?.code ?? 'INTERNAL';
        log({ t: new Date().toISOString(), msg: 'receipt_scan', ok: false, code, bytes: imageBase64.length, ms: now() - started });
        if (err instanceof ApiError) throw err;
        if (err?.code === 'SCAN_UNAVAILABLE') throw new ApiError(503, 'SCAN_UNAVAILABLE', 'The receipt reader is not available right now');
        if (err?.code === 'SCAN_UNREADABLE') throw new ApiError(422, 'SCAN_UNREADABLE', 'The receipt could not be read');
        throw err;
      }
    },
  };
}
