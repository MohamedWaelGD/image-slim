import { describe, expect, it } from 'vitest';
import { findQualityForTargetSize } from '../../src/core/find-target-quality';

function blobWithSize(size: number): Blob {
  return new Blob(['x'.repeat(size)], { type: 'image/webp' });
}

describe('findQualityForTargetSize', () => {
  it('returns the highest configured quality when it already fits', async () => {
    const result = await findQualityForTargetSize(
      async (quality) => blobWithSize(Math.round(100 + quality * 1000)),
      1_100,
      0.4,
      0.82,
    );

    expect(result.quality).toBe(0.82);
    expect(result.blob.size).toBe(920);
    expect(result.targetSizeReached).toBe(true);
  });

  it('searches for the highest quality under the target', async () => {
    const result = await findQualityForTargetSize(
      async (quality) => blobWithSize(Math.round(100 + quality * 1000)),
      700,
      0.4,
      0.9,
      8,
    );

    expect(result.quality).toBeGreaterThan(0.59);
    expect(result.quality).toBeLessThanOrEqual(0.61);
    expect(result.blob.size).toBeLessThanOrEqual(700);
    expect(result.targetSizeReached).toBe(true);
  });

  it('returns the minimum quality and reports an unreachable target', async () => {
    const result = await findQualityForTargetSize(
      async (quality) => blobWithSize(Math.round(100 + quality * 1000)),
      400,
      0.4,
      0.9,
    );

    expect(result.quality).toBe(0.4);
    expect(result.blob.size).toBe(500);
    expect(result.targetSizeReached).toBe(false);
  });

  it('respects a configured quality below the normal search floor', async () => {
    const result = await findQualityForTargetSize(
      async (quality) => blobWithSize(Math.round(100 + quality * 1000)),
      50,
      0.4,
      0,
    );

    expect(result.quality).toBe(0);
    expect(result.targetSizeReached).toBe(false);
  });
});
