import { ImageSlimError } from '../errors/image-slim-error';
import { optimizeImageLocally } from '../core/optimize-image-locally';
import type { WorkerRequest, WorkerResponse } from './protocol';

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

const workerScope = globalThis as unknown as WorkerScope;
const controllers = new Map<number, AbortController>();

function supportsWorkerProcessing(): boolean {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    return false;
  }

  try {
    const canvas = new OffscreenCanvas(1, 1);
    return canvas.getContext('2d') !== null && typeof canvas.convertToBlob === 'function';
  } catch {
    return false;
  }
}

function postError(id: number, error: unknown): void {
  if (error instanceof ImageSlimError) {
    workerScope.postMessage({
      type: 'error',
      id,
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  workerScope.postMessage({
    type: 'error',
    id,
    error: {
      code: 'WORKER_FAILED',
      message: 'The image worker failed while processing the image.',
    },
  });
}

workerScope.onmessage = async ({ data }) => {
  if (data.type === 'cancel') {
    controllers.get(data.id)?.abort('cancelled');
    return;
  }

  const controller = new AbortController();
  controllers.set(data.id, controller);

  try {
    if (!supportsWorkerProcessing()) {
      throw new ImageSlimError(
        'WORKER_UNAVAILABLE',
        'This worker does not support image processing.',
      );
    }

    const result = await optimizeImageLocally(data.file, {
      ...data.options,
      signal: controller.signal,
      processing: 'main-thread',
    });

    workerScope.postMessage({ type: 'result', id: data.id, result });
  } catch (error) {
    postError(data.id, error);
  } finally {
    controllers.delete(data.id);
  }
};
