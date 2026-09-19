import { expect, test } from '@playwright/test';
import {
  benchmarkFixtures,
  createFixtureFromAsset,
  useBuiltPackage,
} from '../browser/browser-utils';

test.describe.configure({ mode: 'serial' });
test.setTimeout(900_000);

test('optimizes multiple 12MP images with bounded Worker concurrency', async ({
  page,
}) => {
  await useBuiltPackage(page, true);
  const fixture = benchmarkFixtures.find((candidate) => candidate.name === '12MP');

  if (!fixture) {
    throw new Error('The 12MP fixture is missing.');
  }

  await createFixtureFromAsset(page, fixture);
  const result = await page.evaluate(async (fixtureKey) => {
    const { optimizeImages } = await import('/dist/index.js');
    const source = (
      globalThis as unknown as { __imageSlimFixtures?: Record<string, Blob> }
    ).__imageSlimFixtures?.[fixtureKey];

    if (!source) {
      throw new Error('The 12MP fixture was not prepared.');
    }

    const results = await optimizeImages([source, source, source, source], {
      processing: 'worker',
      concurrency: 2,
      maxInputSize: 100_000_000,
      targetSize: 1_000_000,
    });

    return results.map((optimized) => ({
      width: optimized.optimized.width,
      height: optimized.optimized.height,
      type: optimized.optimized.type,
      size: optimized.optimized.size,
    }));
  }, `${fixture.width}x${fixture.height}`);

  expect(result).toHaveLength(4);
  expect(result.every((item) => item.width <= 1920 && item.height <= 1920)).toBe(true);
  expect(result.every((item) => item.type === 'image/webp')).toBe(true);
});

test('optimizes multiple 24MP images without exceeding the batch limit', async ({
  page,
}) => {
  await useBuiltPackage(page, true);
  const fixture = benchmarkFixtures.find((candidate) => candidate.name === '24MP');

  if (!fixture) {
    throw new Error('The 24MP fixture is missing.');
  }

  await createFixtureFromAsset(page, fixture);
  const result = await page.evaluate(async (fixtureKey) => {
    const { optimizeImages } = await import('/dist/index.js');
    const source = (
      globalThis as unknown as { __imageSlimFixtures?: Record<string, Blob> }
    ).__imageSlimFixtures?.[fixtureKey];

    if (!source) {
      throw new Error('The 24MP fixture was not prepared.');
    }

    const results = await optimizeImages([source, source], {
      processing: 'worker',
      concurrency: 2,
      maxInputSize: 100_000_000,
      targetSize: 1_000_000,
    });

    return results.map((optimized) => optimized.optimized.size);
  }, `${fixture.width}x${fixture.height}`);

  expect(result).toHaveLength(2);
  expect(result.every((size) => size > 0)).toBe(true);
});

test('cancels queued large-image work', async ({ page }) => {
  await useBuiltPackage(page, true);
  const fixture = benchmarkFixtures.find((candidate) => candidate.name === '12MP');

  if (!fixture) {
    throw new Error('The 12MP fixture is missing.');
  }

  await createFixtureFromAsset(page, fixture);
  const result = await page.evaluate(async (fixtureKey) => {
    const { optimizeImages } = await import('/dist/index.js');
    const source = (
      globalThis as unknown as { __imageSlimFixtures?: Record<string, Blob> }
    ).__imageSlimFixtures?.[fixtureKey];

    if (!source) {
      throw new Error('The 12MP fixture was not prepared.');
    }

    const controller = new AbortController();
    const pending = optimizeImages([source, source, source, source], {
      processing: 'worker',
      concurrency: 2,
      maxInputSize: 100_000_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort('stress cancellation'), 10);

    try {
      await pending;
      return 'completed';
    } catch (error) {
      return error instanceof Error && 'code' in error
        ? (error as Error & { code?: string }).code
        : 'unknown';
    }
  }, `${fixture.width}x${fixture.height}`);

  expect(result).toBe('ABORTED');
});
