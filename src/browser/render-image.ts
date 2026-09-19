import { supportsDomCanvas, supportsOffscreenCanvas } from './capabilities';
import { ImageSlimError } from '../errors/image-slim-error';
import type { ImageFormat, ImageDimensions } from '../types/public';
import type { DecodedImageSource } from './decode-image';

export interface PreparedImageRenderer {
  encode: (quality: number) => Promise<Blob>;
  dispose: () => void;
}

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type CanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

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
  context: CanvasContext,
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

function releaseCanvas(canvas: Canvas): void {
  canvas.width = 0;
  canvas.height = 0;
}

function prepareWithOffscreenCanvas(
  source: DecodedImageSource,
  dimensions: ImageDimensions,
  format: ImageFormat,
  backgroundColor: string,
): PreparedImageRenderer | undefined {
  if (!supportsOffscreenCanvas()) {
    return undefined;
  }

  let canvas: OffscreenCanvas;
  try {
    canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
  } catch {
    return undefined;
  }

  let context: OffscreenCanvasRenderingContext2D | null;
  try {
    context = canvas.getContext('2d');
  } catch {
    releaseCanvas(canvas);
    return undefined;
  }

  if (!context || typeof canvas.convertToBlob !== 'function') {
    releaseCanvas(canvas);
    return undefined;
  }

  try {
    drawImage(context, source, dimensions, format, backgroundColor);
  } catch (cause) {
    releaseCanvas(canvas);
    throw cause;
  }

  return {
    encode: async (quality) => {
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
    },
    dispose: () => releaseCanvas(canvas),
  };
}

function prepareWithDomCanvas(
  source: DecodedImageSource,
  dimensions: ImageDimensions,
  format: ImageFormat,
  backgroundColor: string,
): PreparedImageRenderer {
  if (!supportsDomCanvas()) {
    throw new ImageSlimError(
      'CANVAS_UNAVAILABLE',
      'This environment has no supported canvas.',
    );
  }

  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
  } catch (cause) {
    throw new ImageSlimError('CANVAS_UNAVAILABLE', 'Could not create a canvas.', {
      cause,
    });
  }

  let context: CanvasRenderingContext2D | null;
  try {
    context = canvas.getContext('2d');
  } catch (cause) {
    releaseCanvas(canvas);
    throw new ImageSlimError(
      'CANVAS_UNAVAILABLE',
      'Could not create a 2D canvas context.',
      {
        cause,
      },
    );
  }

  if (!context || typeof canvas.toBlob !== 'function') {
    releaseCanvas(canvas);
    throw new ImageSlimError(
      'CANVAS_UNAVAILABLE',
      'Could not create a usable 2D canvas.',
    );
  }

  try {
    drawImage(context, source, dimensions, format, backgroundColor);
  } catch (cause) {
    releaseCanvas(canvas);
    throw cause;
  }

  return {
    encode: (quality) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(
                new ImageSlimError(
                  'ENCODE_FAILED',
                  'The canvas returned no encoded image.',
                ),
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
      }),
    dispose: () => releaseCanvas(canvas),
  };
}

export function prepareImageRenderer(
  source: DecodedImageSource,
  dimensions: ImageDimensions,
  format: ImageFormat,
  backgroundColor: string,
): PreparedImageRenderer {
  const offscreenRenderer = prepareWithOffscreenCanvas(
    source,
    dimensions,
    format,
    backgroundColor,
  );

  return (
    offscreenRenderer ?? prepareWithDomCanvas(source, dimensions, format, backgroundColor)
  );
}
