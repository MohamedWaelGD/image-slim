import { ImageSlimError } from '../errors/image-slim-error';
import type { ValidatedOptions } from './validate-options';

export function assertValidDecodedDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new ImageSlimError(
      'INVALID_IMAGE_DIMENSIONS',
      `The decoded image reported invalid dimensions (${width} x ${height}).`,
    );
  }
}

function exceedsPixelLimit(width: number, height: number, maxPixels: number): boolean {
  return width > 0 && height > 0 && width > maxPixels / height;
}

export function assertInputDimensions(
  width: number,
  height: number,
  config: ValidatedOptions,
): void {
  if (
    width > config.maxInputWidth ||
    height > config.maxInputHeight ||
    exceedsPixelLimit(width, height, config.maxInputPixels)
  ) {
    throw new ImageSlimError(
      'INPUT_DIMENSIONS_TOO_LARGE',
      `The image is ${width} x ${height} pixels, which exceeds the configured input limits.`,
    );
  }
}

export function assertOutputDimensions(
  width: number,
  height: number,
  config: ValidatedOptions,
): void {
  if (exceedsPixelLimit(width, height, config.maxOutputPixels)) {
    throw new ImageSlimError(
      'OUTPUT_DIMENSIONS_TOO_LARGE',
      `The output would be ${width} x ${height} pixels, which exceeds the ${config.maxOutputPixels}-pixel output limit.`,
    );
  }
}
