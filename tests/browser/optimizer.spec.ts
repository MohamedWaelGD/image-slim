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

test('processes an image off the main thread or reports an unavailable worker', async ({
  page,
}) => {
  await useBuiltPackage(page);

  const outcome = await page.evaluate(async () => {
    const { ImageSlimError, optimizeImage } = await import('/dist/index.js');
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

    try {
      const optimized = await optimizeImage(source, {
        format: 'webp',
        maxWidth: 60,
        maxHeight: 60,
        processing: 'worker',
      });

      return {
        kind: 'optimized' as const,
        width: optimized.optimized.width,
        height: optimized.optimized.height,
        type: optimized.blob.type,
      };
    } catch (error) {
      if (error instanceof ImageSlimError && error.code === 'WORKER_UNAVAILABLE') {
        return { kind: 'unavailable' as const, code: error.code };
      }

      throw error;
    }
  });

  if (outcome.kind === 'optimized') {
    expect(outcome).toMatchObject({ width: 60, height: 40, type: 'image/webp' });
  } else {
    expect(outcome.code).toBe('WORKER_UNAVAILABLE');
  }
});

test('falls back to the main thread when worker processing is unavailable', async ({
  page,
}) => {
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
      processing: 'auto',
    });

    return {
      width: optimized.optimized.width,
      height: optimized.optimized.height,
      type: optimized.blob.type,
    };
  });

  expect(result).toEqual({ width: 60, height: 40, type: 'image/webp' });
});

test('rejects input dimensions above the configured pixel limits', async ({ page }) => {
  await useBuiltPackage(page);

  const code = await page.evaluate(async () => {
    const { ImageSlimError, optimizeImage } = await import('/dist/index.js');
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 400;
    sourceCanvas.height = 400;
    sourceCanvas.getContext('2d')?.fillRect(0, 0, 400, 400);
    const source = await new Promise<Blob>((resolve, reject) => {
      sourceCanvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No source blob'))),
        'image/png',
      );
    });

    try {
      await optimizeImage(source, {
        processing: 'main-thread',
        maxInputWidth: 100,
      });
      return 'resolved';
    } catch (error) {
      return error instanceof ImageSlimError ? error.code : 'unknown';
    }
  });

  expect(code).toBe('INPUT_DIMENSIONS_TOO_LARGE');
});

test('reports batch progress and preserves input order', async ({ page }) => {
  await useBuiltPackage(page);

  const outcome = await page.evaluate(async () => {
    const { optimizeImages } = await import('/dist/index.js');
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 30;
    canvas.getContext('2d')?.fillRect(0, 0, 40, 30);
    const source = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No source blob'))),
        'image/png',
      );
    });

    const events: Array<{ completed: number; total: number; index: number }> = [];
    const results = await optimizeImages([source, source, source], {
      processing: 'main-thread',
      concurrency: 2,
      format: 'webp',
      onProgress: (progress) => events.push(progress),
    });

    return {
      completed: events.map((event) => event.completed),
      totals: events.map((event) => event.total),
      resultCount: results.length,
    };
  });

  expect(outcome.completed).toEqual([1, 2, 3]);
  expect(outcome.totals).toEqual([3, 3, 3]);
  expect(outcome.resultCount).toBe(3);
});
