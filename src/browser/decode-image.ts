import { ImageSlimError } from '../errors/image-slim-error';

export type DecodedImageSource = ImageBitmap | HTMLImageElement;

export interface DecodedImage {
  source: DecodedImageSource;
  width: number;
  height: number;
  close: () => void;
}

export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });

      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch (cause) {
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
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The image element failed to load.'));
      image.src = objectUrl;
    });

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (cause) {
    URL.revokeObjectURL(objectUrl);
    throw new ImageSlimError('DECODE_FAILED', 'The image could not be decoded.', {
      cause,
    });
  }
}
