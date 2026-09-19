export type ImageFormat = 'webp' | 'jpeg' | 'png';
export type ProcessingStrategy = 'auto' | 'worker' | 'main-thread';

export interface ImageOptimizationOptions {
  /** Maximum output width in pixels. Defaults to 1920. */
  maxWidth?: number;
  /** Maximum output height in pixels. Defaults to 1920. */
  maxHeight?: number;
  /** Output format. Defaults to WebP. */
  format?: ImageFormat;
  /** Lossy encoder quality from 0 to 1. Defaults to 0.82. */
  quality?: number;
  /** Desired maximum output size in bytes. Defaults to 1,000,000. */
  targetSize?: number;
  /** Maximum accepted input size in bytes. Defaults to 15,000,000. */
  maxInputSize?: number;
  /** Permit output dimensions larger than the decoded input. Defaults to false. */
  allowUpscale?: boolean;
  /** Background used when converting transparent pixels to JPEG. Defaults to white. */
  backgroundColor?: string;
  /** Abort signal for cooperative cancellation. */
  signal?: AbortSignal;
  /** Processing location. Defaults to auto. */
  processing?: ProcessingStrategy;
}

export interface BatchImageOptimizationOptions extends ImageOptimizationOptions {
  /** Maximum number of images processed at the same time. Defaults to 2. */
  concurrency?: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface OriginalImageMetadata {
  size: number;
  width: number;
  height: number;
  type: string;
}

export interface OptimizedImageMetadata {
  size: number;
  width: number;
  height: number;
  type: string;
}

export interface OptimizedImageResult {
  blob: Blob;
  original: OriginalImageMetadata;
  optimized: OptimizedImageMetadata;
  /** Positive means the output is smaller; negative means it grew. */
  reductionPercentage: number;
  /** Whether the configured targetSize was met. */
  targetSizeReached: boolean;
  /** Quality used for the final encode. PNG encoders may ignore this value. */
  quality: number;
}
