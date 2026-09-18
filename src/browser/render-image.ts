import { supportsDomCanvas, supportsOffscreenCanvas } from './capabilities';
import { ImageSlimError } from '../errors/image-slim-error';
import type { ImageFormat, ImageDimensions } from '../types/public';
import type { DecodedImageSource } from './decode-image';

function getMimeType(format: ImageFormat): string {
  return `image/${format}`;
}

function verifyEncodedType(blob: Blob, expectedType: string): Blob {
  if (blob.type.toLowerCase() !== expectedType) {
    throw new ImageSlimError(
      'UNSUPPORTED_OUTPUT_FORMAT',
      `The browser returned ${blob.type || 'an unknown type'} instead of ${expectedType}.`,
    );
  }

  return blob;
}

function drawImage(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: DecodedImageSource,
  dimensions: ImageDimensions,
  format: ImageFormat,
  backgroundColor: string,
): void {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, dimensions.width, dimensions.height);

  if (format === 'jpeg') {
    context.save();
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, dimensions.width, dimensions.height);
    context.restore();
  }
}

async function renderWithOffscreenCanvas(
  source: DecodedImageSource,
  dimensions: ImageDimensions,
  format: ImageFormat,
  quality: number,
  backgroundColor: string,
): Promise<Blob | undefined> {
  if (!supportsOffscreenCanvas()) {
    return undefined;
  }

  const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
  const context = canvas.getContext('2d');

  if (!context) {
    return undefined;
  }

  drawImage(context, source, dimensions, format, backgroundColor);

  try {
    return verifyEncodedType(
      await canvas.convertToBlob({ type: getMimeType(format), quality }),
      getMimeType(format),
    );
  } catch (cause) {
    if (cause instanceof ImageSlimError) {
      throw cause;
    }

    throw new ImageSlimError('ENCODE_FAILED', 'The image could not be encoded.', {
      cause,
    });
  }
}

async function renderWithDomCanvas(
  source: DecodedImageSource,
  dimensions: ImageDimensions,
  format: ImageFormat,
  quality: number,
  backgroundColor: string,
): Promise<Blob> {
  if (!supportsDomCanvas()) {
    throw new ImageSlimError(
      'CANVAS_UNAVAILABLE',
      'This environment has no supported canvas.',
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new ImageSlimError(
      'CANVAS_UNAVAILABLE',
      'Could not create a 2D canvas context.',
    );
  }

  drawImage(context, source, dimensions, format, backgroundColor);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new ImageSlimError('ENCODE_FAILED', 'The canvas returned no encoded image.'),
          );
          return;
        }

        try {
          resolve(verifyEncodedType(blob, getMimeType(format)));
        } catch (error) {
          reject(error);
        }
      },
      getMimeType(format),
      quality,
    );
  });
}

export async function renderImage(
  source: DecodedImageSource,
  dimensions: ImageDimensions,
  format: ImageFormat,
  quality: number,
  backgroundColor: string,
): Promise<Blob> {
  const offscreenBlob = await renderWithOffscreenCanvas(
    source,
    dimensions,
    format,
    quality,
    backgroundColor,
  );

  return (
    offscreenBlob ??
    renderWithDomCanvas(source, dimensions, format, quality, backgroundColor)
  );
}
