import { ImageSlimError } from '../errors/image-slim-error';
import { createAbortError, throwIfAborted } from '../core/cancellation';
import type { OptimizedImageResult } from '../types/public';
import type { ValidatedOptions } from '../core/validate-options';
import type {
  WorkerErrorResponse,
  WorkerOptimizationOptions,
  WorkerResponse,
} from './protocol';

let nextRequestId = 1;

function isWorkerErrorCode(code: string): boolean {
  return code === 'WORKER_UNAVAILABLE' || code === 'WORKER_FAILED';
}

export function isWorkerFailure(error: unknown): boolean {
  return error instanceof ImageSlimError && isWorkerErrorCode(error.code);
}

function serializeOptions(options: ValidatedOptions): WorkerOptimizationOptions {
  return {
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    format: options.format,
    quality: options.quality,
    targetSize: options.targetSize,
    maxInputSize: options.maxInputSize,
    maxInputWidth: options.maxInputWidth,
    maxInputHeight: options.maxInputHeight,
    maxInputPixels: options.maxInputPixels,
    maxOutputPixels: options.maxOutputPixels,
    allowUpscale: options.allowUpscale,
    backgroundColor: options.backgroundColor,
  };
}

function deserializeError(response: WorkerErrorResponse): ImageSlimError {
  return new ImageSlimError(response.error.code, response.error.message);
}

export async function optimizeImageInWorker(
  file: Blob,
  options: ValidatedOptions,
): Promise<OptimizedImageResult> {
  throwIfAborted(options.signal);

  if (typeof Worker !== 'function') {
    throw new ImageSlimError(
      'WORKER_UNAVAILABLE',
      'This environment does not support module workers.',
    );
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL('./worker/image-slim.worker.js', import.meta.url), {
      type: 'module',
    });
  } catch (cause) {
    throw new ImageSlimError(
      'WORKER_UNAVAILABLE',
      'The image worker could not be started.',
      {
        cause,
      },
    );
  }

  const id = nextRequestId++;

  return await new Promise<OptimizedImageResult>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      options.signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const onAbort = () => {
      try {
        worker.postMessage({ type: 'cancel', id });
      } finally {
        settle(() => reject(createAbortError(options.signal)));
      }
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) {
        return;
      }

      const response = event.data;

      if (response.type === 'result') {
        const result = response.result;
        settle(() => resolve(result));
        return;
      }

      settle(() => reject(deserializeError(response)));
    };

    worker.onerror = (event) => {
      settle(() =>
        reject(
          new ImageSlimError(
            'WORKER_FAILED',
            event.message || 'The image worker failed.',
          ),
        ),
      );
    };

    worker.onmessageerror = () => {
      settle(() =>
        reject(
          new ImageSlimError(
            'WORKER_FAILED',
            'The image worker returned an invalid message.',
          ),
        ),
      );
    };

    if (options.signal?.aborted) {
      onAbort();
      return;
    }

    options.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      worker.postMessage({
        type: 'optimize',
        id,
        file,
        options: serializeOptions(options),
      });
    } catch (cause) {
      settle(() =>
        reject(
          new ImageSlimError('WORKER_FAILED', 'The image worker request failed.', {
            cause,
          }),
        ),
      );
    }
  });
}
