import { describe, expect, it } from 'vitest';
import { readImageDimensions } from '../../src/browser/read-image-dimensions';

function png(width: number, height: number): Blob {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new Blob([bytes], { type: 'image/png' });
}

function webpVp8x(width: number, height: number): Blob {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  const view = new DataView(bytes.buffer);
  const w = width - 1;
  const h = height - 1;
  view.setUint8(24, w & 0xff);
  view.setUint8(25, (w >> 8) & 0xff);
  view.setUint8(26, (w >> 16) & 0xff);
  view.setUint8(27, h & 0xff);
  view.setUint8(28, (h >> 8) & 0xff);
  view.setUint8(29, (h >> 16) & 0xff);
  return new Blob([bytes], { type: 'image/webp' });
}

function webpVp8l(width: number, height: number): Blob {
  const bytes = new Uint8Array(25);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x4c], 12);
  bytes[20] = 0x2f;
  const bits = (width - 1) | ((height - 1) << 14);
  const view = new DataView(bytes.buffer);
  view.setUint32(21, bits >>> 0, true);
  return new Blob([bytes], { type: 'image/webp' });
}

function jpeg(width: number, height: number): Blob {
  const bytes = new Uint8Array(2 + 2 + 7 + 2);

  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xc0;
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 7);
  view.setUint8(6, 8);
  view.setUint16(7, height);
  view.setUint16(9, width);
  bytes[11] = 0xff;
  bytes[12] = 0xd9;

  return new Blob([bytes], { type: 'image/jpeg' });
}

describe('readImageDimensions', () => {
  it('reads PNG dimensions', async () => {
    await expect(readImageDimensions(png(4000, 3000))).resolves.toEqual({
      width: 4000,
      height: 3000,
    });
  });

  it('reads JPEG dimensions', async () => {
    await expect(readImageDimensions(jpeg(640, 480))).resolves.toEqual({
      width: 640,
      height: 480,
    });
  });

  it('reads WebP VP8X dimensions', async () => {
    await expect(readImageDimensions(webpVp8x(1920, 1080))).resolves.toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('reads WebP VP8L dimensions', async () => {
    await expect(readImageDimensions(webpVp8l(800, 600))).resolves.toEqual({
      width: 800,
      height: 600,
    });
  });

  it('returns undefined for unknown or truncated input', async () => {
    await expect(
      readImageDimensions(new Blob(['abc'], { type: 'image/png' })),
    ).resolves.toBeUndefined();
    await expect(readImageDimensions(new Blob([]))).resolves.toBeUndefined();
  });
});
