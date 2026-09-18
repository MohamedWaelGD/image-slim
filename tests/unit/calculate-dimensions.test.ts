import { describe, expect, it } from 'vitest';
import { calculateDimensions } from '../../src/core/calculate-dimensions';

describe('calculateDimensions', () => {
  it('preserves aspect ratio while fitting both bounds', () => {
    expect(calculateDimensions(6000, 4000, 1920, 1080)).toEqual({
      width: 1620,
      height: 1080,
    });
  });

  it('does not enlarge an image by default', () => {
    expect(calculateDimensions(400, 200, 1920, 1920)).toEqual({
      width: 400,
      height: 200,
    });
  });

  it('can enlarge an image when explicitly enabled', () => {
    expect(calculateDimensions(400, 200, 800, 800, true)).toEqual({
      width: 800,
      height: 400,
    });
  });

  it('never returns a zero dimension', () => {
    expect(calculateDimensions(1, 1, 1, 1)).toEqual({ width: 1, height: 1 });
  });
});
