import type { ImageOptimizationOptions } from './types/public';

export const DEFAULT_OPTIONS: Required<ImageOptimizationOptions> = {
  maxWidth: 1920,
  maxHeight: 1920,
  format: 'webp',
  quality: 0.82,
  targetSize: 1_000_000,
  maxInputSize: 15_000_000,
  allowUpscale: false,
  backgroundColor: '#ffffff',
};

export const SUPPORTED_INPUT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const MIME_TYPES = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;
