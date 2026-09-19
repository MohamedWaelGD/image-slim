import { ImageSlimError } from '../errors/image-slim-error';

export function createAbortError(signal?: AbortSignal): ImageSlimError {
  return new ImageSlimError('ABORTED', 'Image optimization was aborted.', {
    cause: signal?.reason,
  });
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw createAbortError(signal);
}
