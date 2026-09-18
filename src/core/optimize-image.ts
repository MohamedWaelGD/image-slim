import { MIME_TYPES } from '../constants';
import { decodeImage } from '../browser/decode-image';
import { renderImage } from '../browser/render-image';
import { ImageSlimError } from '../errors/image-slim-error';
import { calculateDimensions } from './calculate-dimensions';
import { findQualityForTargetSize } from './find-target-quality';
import { validateInput, validateOptions } from './validate-options';
import type { ImageOptimizationOptions, OptimizedImageResult } from '../types/public';

export async function optimizeImage(
  file: Blob,
  options: ImageOptimizationOptions = {},
): Promise<OptimizedImageResult> {
  const config = validateOptions(options);
  validateInput(file, config.maxInputSize);

  const decoded = await decodeImage(file);
  const dimensions = calculateDimensions(
    decoded.width,
    decoded.height,
    config.maxWidth,
    config.maxHeight,
    config.allowUpscale,
  );
  const mimeType = MIME_TYPES[config.format];

  try {
    const encode = (quality: number) =>
      renderImage(
        decoded.source,
        dimensions,
        config.format,
        quality,
        config.backgroundColor,
      );

    let blob: Blob;
    let quality = config.quality;
    let targetSizeReached = true;

    if (config.format === 'png') {
      blob = await encode(config.quality);
      targetSizeReached = blob.size <= config.targetSize;
    } else {
      const qualityResult = await findQualityForTargetSize(
        encode,
        config.targetSize,
        0.4,
        config.quality,
      );
      blob = qualityResult.blob;
      quality = qualityResult.quality;
      targetSizeReached = qualityResult.targetSizeReached;
    }

    if (blob.type !== mimeType) {
      throw new ImageSlimError(
        'UNSUPPORTED_OUTPUT_FORMAT',
        `The browser returned ${blob.type || 'an unknown type'} instead of ${mimeType}.`,
      );
    }

    return {
      blob,
      original: {
        size: file.size,
        width: decoded.width,
        height: decoded.height,
        type: file.type,
      },
      optimized: {
        size: blob.size,
        width: dimensions.width,
        height: dimensions.height,
        type: blob.type,
      },
      reductionPercentage:
        file.size === 0 ? 0 : ((file.size - blob.size) / file.size) * 100,
      targetSizeReached,
      quality,
    };
  } finally {
    decoded.close();
  }
}
