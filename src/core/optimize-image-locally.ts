import { decodeImage } from '../browser/decode-image';
import { prepareImageRenderer } from '../browser/render-image';
import { readImageDimensions } from '../browser/read-image-dimensions';
import { throwIfAborted } from './cancellation';
import { calculateDimensions } from './calculate-dimensions';
import {
  assertInputDimensions,
  assertOutputDimensions,
  assertValidDecodedDimensions,
} from './enforce-dimension-limits';
import { findQualityForTargetSize } from './find-target-quality';
import { validateInput, validateOptions } from './validate-options';
import type { ImageOptimizationOptions, OptimizedImageResult } from '../types/public';
import type { ValidatedOptions } from './validate-options';

export async function optimizeImageLocally(
  file: Blob,
  options: ImageOptimizationOptions = {},
): Promise<OptimizedImageResult> {
  return optimizeImageWithValidatedOptions(file, validateOptions(options));
}

export async function optimizeImageWithValidatedOptions(
  file: Blob,
  config: ValidatedOptions,
): Promise<OptimizedImageResult> {
  throwIfAborted(config.signal);
  validateInput(file, config.maxInputSize);

  const headerDimensions = await readImageDimensions(file);
  if (headerDimensions) {
    assertInputDimensions(headerDimensions.width, headerDimensions.height, config);
  }

  throwIfAborted(config.signal);

  const decoded = await decodeImage(file, config.signal);
  assertValidDecodedDimensions(decoded.width, decoded.height);
  assertInputDimensions(decoded.width, decoded.height, config);

  const dimensions = calculateDimensions(
    decoded.width,
    decoded.height,
    config.maxWidth,
    config.maxHeight,
    config.allowUpscale,
  );
  assertOutputDimensions(dimensions.width, dimensions.height, config);
  let renderer: ReturnType<typeof prepareImageRenderer> | undefined;

  try {
    throwIfAborted(config.signal);
    renderer = prepareImageRenderer(
      decoded.source,
      dimensions,
      config.format,
      config.backgroundColor,
    );

    const preparedRenderer = renderer;
    const encode = async (quality: number) => {
      throwIfAborted(config.signal);
      const blob = await preparedRenderer.encode(quality);
      throwIfAborted(config.signal);
      return blob;
    };

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
    renderer?.dispose();
    decoded.close();
  }
}
