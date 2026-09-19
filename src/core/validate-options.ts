import { DEFAULT_OPTIONS, SUPPORTED_INPUT_TYPES } from '../constants';
import { ImageSlimError } from '../errors/image-slim-error';
import type {
  ImageFormat,
  ImageOptimizationOptions,
  ProcessingStrategy,
} from '../types/public';

export interface ValidatedOptions {
  maxWidth: number;
  maxHeight: number;
  format: ImageFormat;
  quality: number;
  targetSize: number;
  maxInputSize: number;
  allowUpscale: boolean;
  backgroundColor: string;
  signal?: AbortSignal;
  processing: ProcessingStrategy;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function assertPositiveOption(name: string, value: number): void {
  if (!isPositiveFiniteNumber(value)) {
    throw new ImageSlimError(
      'INVALID_OPTIONS',
      `${name} must be a finite number greater than zero.`,
    );
  }
}

export function validateInput(blob: Blob, maxInputSize: number): void {
  if (!blob || typeof blob !== 'object' || typeof blob.size !== 'number') {
    throw new ImageSlimError('INVALID_INPUT', 'Input must be a Blob.');
  }

  if (!SUPPORTED_INPUT_TYPES.has(blob.type.toLowerCase())) {
    throw new ImageSlimError(
      'INVALID_INPUT_TYPE',
      `Unsupported input type: ${blob.type || 'unknown'}. Expected JPEG, PNG, or WebP.`,
    );
  }

  if (blob.size > maxInputSize) {
    throw new ImageSlimError(
      'INPUT_TOO_LARGE',
      `Input is ${blob.size} bytes, which exceeds the ${maxInputSize}-byte limit.`,
    );
  }
}

export function validateOptions(options: ImageOptimizationOptions): ValidatedOptions {
  const config: ValidatedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  assertPositiveOption('maxWidth', config.maxWidth);
  assertPositiveOption('maxHeight', config.maxHeight);
  assertPositiveOption('targetSize', config.targetSize);
  assertPositiveOption('maxInputSize', config.maxInputSize);

  if (!Number.isInteger(config.maxWidth) || !Number.isInteger(config.maxHeight)) {
    throw new ImageSlimError(
      'INVALID_OPTIONS',
      'maxWidth and maxHeight must be integers.',
    );
  }

  if (config.quality < 0 || config.quality > 1 || !Number.isFinite(config.quality)) {
    throw new ImageSlimError(
      'INVALID_OPTIONS',
      'quality must be a finite number from 0 to 1.',
    );
  }

  if (!['webp', 'jpeg', 'png'].includes(config.format)) {
    throw new ImageSlimError(
      'INVALID_OPTIONS',
      `Unsupported output format: ${config.format}.`,
    );
  }

  if (typeof config.allowUpscale !== 'boolean') {
    throw new ImageSlimError('INVALID_OPTIONS', 'allowUpscale must be a boolean.');
  }

  if (
    typeof config.backgroundColor !== 'string' ||
    config.backgroundColor.trim() === ''
  ) {
    throw new ImageSlimError(
      'INVALID_OPTIONS',
      'backgroundColor must be a non-empty string.',
    );
  }

  if (
    config.signal !== undefined &&
    (typeof config.signal !== 'object' ||
      config.signal === null ||
      typeof config.signal.aborted !== 'boolean' ||
      typeof config.signal.addEventListener !== 'function' ||
      typeof config.signal.removeEventListener !== 'function')
  ) {
    throw new ImageSlimError('INVALID_OPTIONS', 'signal must be an AbortSignal.');
  }

  if (!['auto', 'worker', 'main-thread'].includes(config.processing)) {
    throw new ImageSlimError(
      'INVALID_OPTIONS',
      `Unsupported processing strategy: ${config.processing}.`,
    );
  }

  return config;
}
