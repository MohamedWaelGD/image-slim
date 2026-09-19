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
  maxInputWidth: number;
  maxInputHeight: number;
  maxInputPixels: number;
  maxOutputPixels: number;
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

export function isBlobLike(value: unknown): value is { size: number; type: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { size?: unknown; type?: unknown };

  return (
    typeof candidate.size === 'number' &&
    Number.isFinite(candidate.size) &&
    typeof candidate.type === 'string'
  );
}

export function validateInput(blob: Blob, maxInputSize: number): void {
  if (!isBlobLike(blob)) {
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
  assertPositiveOption('maxInputWidth', config.maxInputWidth);
  assertPositiveOption('maxInputHeight', config.maxInputHeight);
  assertPositiveOption('maxInputPixels', config.maxInputPixels);
  assertPositiveOption('maxOutputPixels', config.maxOutputPixels);

  if (!Number.isInteger(config.maxWidth) || !Number.isInteger(config.maxHeight)) {
    throw new ImageSlimError(
      'INVALID_OPTIONS',
      'maxWidth and maxHeight must be integers.',
    );
  }

  if (
    !Number.isInteger(config.maxInputWidth) ||
    !Number.isInteger(config.maxInputHeight) ||
    !Number.isInteger(config.maxInputPixels) ||
    !Number.isInteger(config.maxOutputPixels)
  ) {
    throw new ImageSlimError(
      'INVALID_OPTIONS',
      'maxInputWidth, maxInputHeight, maxInputPixels, and maxOutputPixels must be integers.',
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
