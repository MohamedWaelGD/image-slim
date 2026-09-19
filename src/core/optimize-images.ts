import { createAbortError } from './cancellation';
import { optimizeImage } from './optimize-image';
import { validateOptions } from './validate-options';
import { ImageSlimError } from '../errors/image-slim-error';
import type {
  BatchImageOptimizationOptions,
  ImageOptimizationOptions,
  OptimizedImageResult,
} from '../types/public';

const DEFAULT_BATCH_CONCURRENCY = 2;

function validateConcurrency(concurrency: number): void {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new ImageSlimError(
      'INVALID_OPTIONS',
      'concurrency must be a finite integer greater than zero.',
    );
  }
}

function createBatchController(signal?: AbortSignal): AbortController {
  const controller = new AbortController();

  if (signal?.aborted) {
    controller.abort(signal.reason);
  }

  return controller;
}

export async function optimizeImages(
  files: readonly Blob[],
  options: BatchImageOptimizationOptions = {},
): Promise<OptimizedImageResult[]> {
  const { concurrency = DEFAULT_BATCH_CONCURRENCY, ...imageOptions } = options;
  validateConcurrency(concurrency);
  validateOptions(imageOptions as ImageOptimizationOptions);

  if (files.length === 0) {
    return [];
  }

  const controller = createBatchController(imageOptions.signal);
  const results = new Array<OptimizedImageResult>(files.length);
  const workerCount = Math.min(concurrency, files.length);
  let nextIndex = 0;
  let completed = 0;
  let settled = false;

  return await new Promise<OptimizedImageResult[]>((resolve, reject) => {
    const onExternalAbort = () => {
      if (!settled) {
        settled = true;
        controller.abort(imageOptions.signal?.reason);
        cleanup();
        reject(createAbortError(imageOptions.signal));
      }
    };

    imageOptions.signal?.addEventListener('abort', onExternalAbort, { once: true });

    const cleanup = () => {
      imageOptions.signal?.removeEventListener('abort', onExternalAbort);
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      controller.abort(error);
      cleanup();
      reject(error);
    };

    const complete = () => {
      if (settled || completed !== files.length) {
        return;
      }

      settled = true;
      cleanup();
      resolve(results);
    };

    const run = async (): Promise<void> => {
      while (!settled && !controller.signal.aborted) {
        const index = nextIndex;

        if (index >= files.length) {
          return;
        }

        nextIndex += 1;
        const file = files[index];

        if (file === undefined) {
          fail(new ImageSlimError('INVALID_INPUT', 'Input must be a Blob.'));
          return;
        }

        try {
          results[index] = await optimizeImage(file, {
            ...imageOptions,
            signal: controller.signal,
          });
          completed += 1;
          complete();
        } catch (error) {
          fail(error);
          return;
        }
      }
    };

    if (controller.signal.aborted) {
      onExternalAbort();
      return;
    }

    for (let index = 0; index < workerCount; index += 1) {
      void run();
    }
  });
}
