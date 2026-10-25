// Gets a photo ready to send to the receipt reader: upright, at most 1600 px on the long side, re-encoded as JPEG. That keeps the
// request small and also removes the GPS position and the camera data the original file carries (re-drawing it to a canvas
// keeps only the pixels).

export class PhotoError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'PhotoError';
    this.code = 'UNREADABLE_IMAGE';
  }
}

/** Largest base64 text the API accepts (apps/api/src/services/receipts.js), with room to spare. */
const MAX_BASE64 = 1_300_000;
const ATTEMPTS = [
  { maxEdge: 1600, quality: 0.82 },
  { maxEdge: 1280, quality: 0.75 },
  { maxEdge: 960, quality: 0.7 },
];

/**
 * @param {number} width
 * @param {number} height
 * @param {number} maxEdge
 * @returns {{ width: number, height: number }} the same shape, never larger than the original
 */
export function fitWithin(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** @param {Uint8Array} bytes */
export function bytesToBase64(bytes) {
  let binary = '';
  // In slices, so a large photo does not overflow the argument limit of String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * @param {File} file
 * @returns {Promise<{ mimeType: 'image/jpeg', imageBase64: string }>}
 * @throws {PhotoError} when the browser cannot open the file as an image, or it cannot be made small enough
 */
export async function prepareReceiptPhoto(file) {
  let bitmap;
  try {
    // "from-image" applies the camera's rotation before it is dropped, so a portrait photo is not sent sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('This image could not be opened');
  }
  try {
    for (const { maxEdge, quality } of ATTEMPTS) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new PhotoError('This browser cannot process images');
      // JPEG has no transparency: a screenshot with a transparent background would turn black without this.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw new PhotoError('This image could not be converted');
      const imageBase64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
      if (imageBase64.length <= MAX_BASE64) return { mimeType: 'image/jpeg', imageBase64 };
    }
  } finally {
    bitmap.close?.();
  }
  throw new PhotoError('This image is too large');
}
