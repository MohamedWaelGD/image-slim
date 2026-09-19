export type ImageSlimErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_INPUT_TYPE'
  | 'INPUT_TOO_LARGE'
  | 'INPUT_DIMENSIONS_TOO_LARGE'
  | 'OUTPUT_DIMENSIONS_TOO_LARGE'
  | 'INVALID_IMAGE_DIMENSIONS'
  | 'INVALID_OPTIONS'
  | 'ABORTED'
  | 'WORKER_UNAVAILABLE'
  | 'WORKER_FAILED'
  | 'DECODE_FAILED'
  | 'CANVAS_UNAVAILABLE'
  | 'ENCODE_FAILED'
  | 'UNSUPPORTED_OUTPUT_FORMAT';

export class ImageSlimError extends Error {
  override readonly name = 'ImageSlimError';
  readonly cause?: unknown;

  constructor(
    readonly code: ImageSlimErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.cause = options?.cause;
  }
}
