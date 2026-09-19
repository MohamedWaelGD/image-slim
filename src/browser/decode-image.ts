import { ImageSlimError } from '../errors/image-slim-error';
import { throwIfAborted } from '../core/cancellation';

export type DecodedImageSource = ImageBitmap | HTMLImageElement;

export interface DecodedImage {
  source: DecodedImageSource;
  width: number;
  height: number;
  close: () => void;
}

export async function decodeImage(
  blob: Blob,
  signal?: AbortSignal,
): Promise<DecodedImage> {
  throwIfAborted(signal);

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });

      if (signal?.aborted) {
        bitmap.close();
        throwIfAborted(signal);
      }

      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch (cause) {
      if (cause instanceof ImageSlimError) {
        throw cause;
      }

      if (signal?.aborted) {
        throwIfAborted(signal);
      }

      throw new ImageSlimError('DECODE_FAILED', 'The image could not be decoded.', {
        cause,
      });
    }
  }

  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new ImageSlimError(
      'DECODE_FAILED',
      'This environment has neither createImageBitmap nor an HTML image decoder.',
    );
  }

  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';

  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
        signal?.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        cleanup();
        image.src = '';
        reject(
          new ImageSlimError('ABORTED', 'Image optimization was aborted.', {
            cause: signal?.reason,
          }),
        );
      };

      image.onload = () => {
        cleanup();
        resolve();
      };
      image.onerror = () => {
        cleanup();
        reject(new Error('The image element failed to load.'));
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }

      signal?.addEventListener('abort', onAbort, { once: true });
      image.src = objectUrl;
    });

    throwIfAborted(signal);

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (cause) {
    URL.revokeObjectURL(objectUrl);

    if (cause instanceof ImageSlimError) {
      throw cause;
    }

    throw new ImageSlimError('DECODE_FAILED', 'The image could not be decoded.', {
      cause,
    });
  }
}
