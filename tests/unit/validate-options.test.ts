import { describe, expect, it } from 'vitest';
import { ImageSlimError } from '../../src/errors/image-slim-error';
import { validateInput, validateOptions } from '../../src/core/validate-options';

describe('validateOptions', () => {
  it('applies the documented defaults', () => {
    expect(validateOptions({})).toEqual({
      maxWidth: 1920,
      maxHeight: 1920,
      format: 'webp',
      quality: 0.82,
      targetSize: 1_000_000,
      maxInputSize: 15_000_000,
      allowUpscale: false,
      backgroundColor: '#ffffff',
      processing: 'auto',
    });
  });

  it('rejects invalid quality values', () => {
    expect(() => validateOptions({ quality: 1.1 })).toThrowError(ImageSlimError);
    expect(() => validateOptions({ quality: 1.1 })).toThrow(/quality/);
  });

  it('rejects non-integer dimensions', () => {
    expect(() => validateOptions({ maxWidth: 10.5 })).toThrow(/integers/);
  });

  it('rejects invalid abort signals', () => {
    expect(() => validateOptions({ signal: {} as AbortSignal })).toThrow(/signal/);
  });

  it('rejects invalid processing strategies', () => {
    expect(() => validateOptions({ processing: 'invalid' as 'auto' })).toThrow(
      /processing strategy/,
    );
  });
});

describe('validateInput', () => {
  it('accepts supported image MIME types case-insensitively', () => {
    const image = new Blob(['image'], { type: 'image/PNG' });
    expect(() => validateInput(image, 100)).not.toThrow();
  });

  it('rejects unsupported MIME types with a stable error code', () => {
    try {
      validateInput(new Blob(['text'], { type: 'text/plain' }), 100);
      throw new Error('Expected validation to fail.');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_INPUT_TYPE' });
    }
  });

  it('rejects inputs larger than the configured limit', () => {
    expect(() => validateInput(new Blob(['12345'], { type: 'image/png' }), 4)).toThrow(
      /exceeds/,
    );
  });
});
