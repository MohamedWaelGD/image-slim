import { describe, expect, it } from 'vitest';
import { validateOptions } from '../../src/core/validate-options';
import {
  assertInputDimensions,
  assertOutputDimensions,
  assertValidDecodedDimensions,
} from '../../src/core/enforce-dimension-limits';

describe('dimension limits', () => {
  it('accepts dimensions exactly at the configured limits', () => {
    const config = validateOptions({
      maxInputWidth: 100,
      maxInputHeight: 100,
      maxInputPixels: 10_000,
    });

    expect(() => assertInputDimensions(100, 100, config)).not.toThrow();
  });

  it('rejects a width one pixel over the limit', () => {
    const config = validateOptions({ maxInputWidth: 100, maxInputHeight: 100 });

    expect(() => assertInputDimensions(101, 50, config)).toThrow(/limits/);
  });

  it('rejects a total pixel count over the limit', () => {
    const config = validateOptions({
      maxInputWidth: 100_000,
      maxInputHeight: 100_000,
      maxInputPixels: 40_000_000,
    });

    expect(() => assertInputDimensions(10_000, 8_000, config)).toThrow(/limits/);
  });

  it('rejects output dimensions over the output pixel limit', () => {
    const config = validateOptions({ maxOutputPixels: 1_000 });

    expect(() => assertOutputDimensions(100, 100, config)).toThrow(/output limit/);
  });

  it('flags invalid decoded dimensions', () => {
    expect(() => assertValidDecodedDimensions(0, 10)).toThrow(/invalid dimensions/);
    expect(() => assertValidDecodedDimensions(Number.NaN, 10)).toThrow(
      /invalid dimensions/,
    );
  });
});
