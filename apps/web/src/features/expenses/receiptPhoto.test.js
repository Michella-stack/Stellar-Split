import { describe, expect, it } from 'vitest';
import { bytesToBase64, fitWithin, PhotoError, prepareReceiptPhoto } from './receiptPhoto.js';

describe('fitWithin', () => {
  it('shrinks the long side to the limit and keeps the shape', () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('never enlarges a small image', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('never returns a side of zero, even for a very thin image', () => {
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe('bytesToBase64', () => {
  it('decodes back to the same bytes, including for photos larger than one slice', () => {
    for (const size of [0, 1, 2, 3, 100, 0x8000, 0x8000 + 1, 200_000]) {
      const bytes = Uint8Array.from({ length: size }, (_, i) => (i * 31 + 7) % 256);
      const encoded = bytesToBase64(bytes);
      expect(encoded).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      expect(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))).toEqual(bytes);
    }
  });
});

describe('prepareReceiptPhoto', () => {
  it('reports an image the browser cannot open as a PhotoError, not a crash', async () => {
    // Node has no createImageBitmap, which is also what a browser without support looks like.
    await expect(prepareReceiptPhoto(new Blob(['not an image'], { type: 'image/jpeg' }))).rejects.toBeInstanceOf(PhotoError);
  });
});
