import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ImageOptimizationOptions,
  OptimizedImageResult,
} from '../../src/types/public';

const mockOptimizeImage = vi.hoisted(() => vi.fn());

vi.mock('../../src/core/optimize-image', () => ({
  optimizeImage: mockOptimizeImage,
}));

import { optimizeImages } from '../../src/core/optimize-images';

function resultFor(file: Blob): OptimizedImageResult {
  return {
    blob: file,
    original: { size: file.size, width: 1, height: 1, type: file.type },
    optimized: { size: file.size, width: 1, height: 1, type: file.type },
    reductionPercentage: 0,
    targetSizeReached: true,
    quality: 0.82,
  };
}

const defaultOptions: ImageOptimizationOptions = {
  processing: 'main-thread',
};

afterEach(() => {
  mockOptimizeImage.mockReset();
});

describe('optimizeImages', () => {
  it('preserves input order while limiting active work', async () => {
    let active = 0;
    let maximumActive = 0;

    mockOptimizeImage.mockImplementation(async (file: Blob) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, file.size === 1 ? 20 : 1));
      active -= 1;
      return resultFor(file);
    });

    const files = [
      new Blob(['a'], { type: 'image/jpeg' }),
      new Blob(['bb'], { type: 'image/jpeg' }),
      new Blob(['ccc'], { type: 'image/jpeg' }),
      new Blob(['dddd'], { type: 'image/jpeg' }),
    ];

    const results = await optimizeImages(files, {
      ...defaultOptions,
      concurrency: 2,
    });

    expect(maximumActive).toBe(2);
    expect(results.map((result) => result.blob.size)).toEqual([1, 2, 3, 4]);
    expect(mockOptimizeImage).toHaveBeenCalledTimes(files.length);
  });

  it('returns an empty array without starting work', async () => {
    await expect(optimizeImages([], defaultOptions)).resolves.toEqual([]);
    expect(mockOptimizeImage).not.toHaveBeenCalled();
  });

  it('rejects sparse input instead of leaving the batch pending', async () => {
    const files = new Array<Blob>(1);

    await expect(optimizeImages(files, defaultOptions)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(mockOptimizeImage).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid concurrency %s',
    async (concurrency) => {
      await expect(
        optimizeImages([new Blob(['image'], { type: 'image/jpeg' })], {
          ...defaultOptions,
          concurrency,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    },
  );

  it('fails fast and does not start queued files', async () => {
    const started: Blob[] = [];
    const controllers: AbortSignal[] = [];
    const failure = new Error('bad image');

    mockOptimizeImage.mockImplementation(
      async (file: Blob, options: ImageOptimizationOptions) => {
        started.push(file);
        if (file.size === 2) {
          throw failure;
        }

        controllers.push(options.signal as AbortSignal);
        await new Promise((resolve) => setTimeout(resolve, 50));
        return resultFor(file);
      },
    );

    const files = [
      new Blob(['a'], { type: 'image/jpeg' }),
      new Blob(['bb'], { type: 'image/jpeg' }),
      new Blob(['ccc'], { type: 'image/jpeg' }),
      new Blob(['dddd'], { type: 'image/jpeg' }),
    ];

    await expect(
      optimizeImages(files, { ...defaultOptions, concurrency: 2 }),
    ).rejects.toBe(failure);

    expect(started.map((file) => file.size)).toEqual([1, 2]);
    expect(controllers.every((signal) => signal.aborted)).toBe(true);
  });

  it('cancels active and queued work when the caller aborts', async () => {
    const controller = new AbortController();
    let started = 0;

    mockOptimizeImage.mockImplementation(
      async (_file: Blob, options: ImageOptimizationOptions) => {
        started += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (options.signal?.aborted) {
          throw new Error('mock observed abort');
        }
        return resultFor(new Blob(['result'], { type: 'image/jpeg' }));
      },
    );

    const pending = optimizeImages(
      [
        new Blob(['a'], { type: 'image/jpeg' }),
        new Blob(['b'], { type: 'image/jpeg' }),
        new Blob(['c'], { type: 'image/jpeg' }),
      ],
      { ...defaultOptions, concurrency: 2, signal: controller.signal },
    );

    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort('test cancellation');

    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    expect(started).toBe(2);
  });
});
