import { expect, test } from '@playwright/test';
import { useBuiltPackage } from './browser-utils';

test('resizes and encodes an image through the public API', async ({ page }) => {
  await useBuiltPackage(page);

  const result = await page.evaluate(async () => {
    const { optimizeImage } = await import('/dist/index.js');
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 120;
    sourceCanvas.height = 80;
    const context = sourceCanvas.getContext('2d');
    context?.fillRect(0, 0, 120, 80);
    const source = await new Promise<Blob>((resolve, reject) => {
      sourceCanvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No source blob'))),
        'image/png',
      );
    });

    const optimized = await optimizeImage(source, {
      maxWidth: 60,
      maxHeight: 60,
      format: 'webp',
      quality: 0.82,
      targetSize: 100_000,
      processing: 'main-thread',
    });

    return {
      original: optimized.original,
      output: optimized.optimized,
      targetSizeReached: optimized.targetSizeReached,
      blobType: optimized.blob.type,
    };
  });

  expect(result.original.width).toBe(120);
  expect(result.original.height).toBe(80);
  expect(result.output.width).toBe(60);
  expect(result.output.height).toBe(40);
  expect(result.output.type).toBe('image/webp');
  expect(result.blobType).toBe('image/webp');
  expect(result.targetSizeReached).toBe(true);
});

test('encodes transparent pixels onto a white JPEG background', async ({ page }) => {
  await useBuiltPackage(page);

  const pixel = await page.evaluate(async () => {
    const { optimizeImage } = await import('/dist/index.js');
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 2;
    sourceCanvas.height = 2;
    const context = sourceCanvas.getContext('2d');
    if (!context) throw new Error('No source context');
    context.clearRect(0, 0, 2, 2);
    const source = await new Promise<Blob>((resolve, reject) => {
      sourceCanvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No source blob'))),
        'image/png',
      );
    });

    const optimized = await optimizeImage(source, {
      format: 'jpeg',
      quality: 0.9,
      targetSize: 100_000,
      processing: 'main-thread',
    });
    const bitmap = await createImageBitmap(optimized.blob);
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = bitmap.width;
    outputCanvas.height = bitmap.height;
    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) throw new Error('No output context');
    outputContext.drawImage(bitmap, 0, 0);
    bitmap.close();
    return Array.from(outputContext.getImageData(0, 0, 1, 1).data);
  });

  expect(pixel[0]).toBeGreaterThan(245);
  expect(pixel[1]).toBeGreaterThan(245);
  expect(pixel[2]).toBeGreaterThan(245);
  expect(pixel[3]).toBe(255);
});

test('processes an image in the packaged worker entry', async ({ page }) => {
  await useBuiltPackage(page);

  const result = await page.evaluate(async () => {
    const { optimizeImage } = await import('/dist/index.js');
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 120;
    sourceCanvas.height = 80;
    sourceCanvas.getContext('2d')?.fillRect(0, 0, 120, 80);
    const source = await new Promise<Blob>((resolve, reject) => {
      sourceCanvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No source blob'))),
        'image/png',
      );
    });

    const optimized = await optimizeImage(source, {
      format: 'webp',
      maxWidth: 60,
      maxHeight: 60,
      processing: 'worker',
    });

    return {
      width: optimized.optimized.width,
      height: optimized.optimized.height,
      type: optimized.blob.type,
    };
  });

  expect(result).toEqual({ width: 60, height: 40, type: 'image/webp' });
});
