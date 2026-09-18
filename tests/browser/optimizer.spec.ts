import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const bundledLibrary = readFileSync(resolve('dist/index.js'));
const bundledLibraryUrl = `data:text/javascript;base64,${bundledLibrary.toString('base64')}`;

test('resizes and encodes an image through the public API', async ({ page }) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { optimizeImage } = await import(moduleUrl);
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
    });

    return {
      original: optimized.original,
      output: optimized.optimized,
      targetSizeReached: optimized.targetSizeReached,
      blobType: optimized.blob.type,
    };
  }, bundledLibraryUrl);

  expect(result.original.width).toBe(120);
  expect(result.original.height).toBe(80);
  expect(result.output.width).toBe(60);
  expect(result.output.height).toBe(40);
  expect(result.output.type).toBe('image/webp');
  expect(result.blobType).toBe('image/webp');
  expect(result.targetSizeReached).toBe(true);
});

test('encodes transparent pixels onto a white JPEG background', async ({ page }) => {
  const pixel = await page.evaluate(async (moduleUrl) => {
    const { optimizeImage } = await import(moduleUrl);
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
  }, bundledLibraryUrl);

  expect(pixel[0]).toBeGreaterThan(245);
  expect(pixel[1]).toBeGreaterThan(245);
  expect(pixel[2]).toBeGreaterThan(245);
  expect(pixel[3]).toBe(255);
});
