import { mkdirSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { expect, test } from '@playwright/test';
import {
  benchmarkFixtures,
  createFixtureFromAsset,
  useBuiltPackage,
} from '../browser/browser-utils';

interface BenchmarkMeasurement {
  fixture: string;
  width: number;
  height: number;
  megapixels: number;
  strategy: 'main-thread' | 'worker';
  durationMs: number;
  longTaskCount: number;
  longTaskDurationMs: number;
  maxEventLoopDelayMs: number;
  memoryBeforeBytes: number | null;
  memoryPeakBytes: number | null;
  memoryAfterBytes: number | null;
  inputBytes: number;
  outputBytes: number;
  outputWidth: number;
  outputHeight: number;
  outputType: string;
  quality: number;
  targetSizeReached: boolean;
}

interface BrowserMemory {
  bytes: number;
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(600_000);

test('records image optimization performance across megapixel tiers', async ({
  page,
}) => {
  await useBuiltPackage(page, true);

  for (const fixture of benchmarkFixtures) {
    await createFixtureFromAsset(page, fixture);
  }

  const runs = Math.max(1, Number.parseInt(process.env.BENCHMARK_RUNS ?? '2', 10));
  const measurements: BenchmarkMeasurement[] = [];

  for (const fixture of benchmarkFixtures) {
    for (const strategy of ['main-thread', 'worker'] as const) {
      for (let run = 0; run < runs; run += 1) {
        const measurement = await page.evaluate(
          async ({ fixtureKey, fixtureName, width, height, strategy }) => {
            const performanceWithMemory = performance as Performance & {
              memory?: { usedJSHeapSize: number };
              measureUserAgentSpecificMemory?: () => Promise<BrowserMemory>;
            };
            const store = (
              globalThis as unknown as { __imageSlimFixtures?: Record<string, Blob> }
            ).__imageSlimFixtures;
            const source = store?.[fixtureKey];

            if (!source) {
              throw new Error(`Fixture ${fixtureKey} was not prepared.`);
            }

            const readMemory = async (): Promise<number | null> => {
              try {
                if (performanceWithMemory.measureUserAgentSpecificMemory) {
                  return (await performanceWithMemory.measureUserAgentSpecificMemory())
                    .bytes;
                }
              } catch {
                // The API requires browser permissions that are not always available.
              }

              return performanceWithMemory.memory?.usedJSHeapSize ?? null;
            };

            const longTasksBefore = performance.getEntriesByType('longtask').length;
            let maxEventLoopDelayMs = 0;
            let lastHeartbeat = performance.now();
            const heartbeat = window.setInterval(() => {
              const now = performance.now();
              maxEventLoopDelayMs = Math.max(maxEventLoopDelayMs, now - lastHeartbeat);
              lastHeartbeat = now;
            }, 16);
            const memoryBeforeBytes = await readMemory();
            const startedAt = performance.now();
            const { optimizeImage } = await import('/dist/index.js');
            const result = await optimizeImage(source, {
              processing: strategy,
              maxWidth: 1920,
              maxHeight: 1920,
              targetSize: 1_000_000,
              maxInputSize: 100_000_000,
            });
            const durationMs = performance.now() - startedAt;
            clearInterval(heartbeat);
            const memoryPeakBytes = await readMemory();
            await new Promise((resolve) => setTimeout(resolve, 0));
            const memoryAfterBytes = await readMemory();
            const longTasks = performance
              .getEntriesByType('longtask')
              .slice(longTasksBefore);

            return {
              fixture: fixtureName,
              width,
              height,
              megapixels: (width * height) / 1_000_000,
              strategy,
              durationMs,
              longTaskCount: longTasks.length,
              longTaskDurationMs: longTasks.reduce(
                (total, entry) => total + entry.duration,
                0,
              ),
              maxEventLoopDelayMs,
              memoryBeforeBytes,
              memoryPeakBytes,
              memoryAfterBytes,
              inputBytes: source.size,
              outputBytes: result.optimized.size,
              outputWidth: result.optimized.width,
              outputHeight: result.optimized.height,
              outputType: result.optimized.type,
              quality: result.quality,
              targetSizeReached: result.targetSizeReached,
            } satisfies BenchmarkMeasurement;
          },
          {
            fixtureKey: `${fixture.width}x${fixture.height}`,
            fixtureName: fixture.name,
            width: fixture.width,
            height: fixture.height,
            strategy,
          },
        );

        measurements.push(measurement);
      }
    }
  }

  expect(measurements).toHaveLength(benchmarkFixtures.length * 2 * runs);
  mkdirSync('benchmark-results', { recursive: true });
  writeFileSync(
    'benchmark-results/latest.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        platform: platform(),
        browser: 'chromium',
        runs,
        measurements,
      },
      null,
      2,
    ),
  );

  const rows = measurements
    .map(
      (measurement) =>
        `| ${measurement.fixture} | ${measurement.strategy} | ${measurement.durationMs.toFixed(1)} | ${measurement.maxEventLoopDelayMs.toFixed(1)} | ${measurement.outputBytes} | ${measurement.memoryPeakBytes ?? 'n/a'} |`,
    )
    .join('\n');
  writeFileSync(
    'benchmark-results/latest.md',
    `# ImageSlim Performance Benchmark\n\nGenerated: ${new Date().toISOString()}\n\nMemory values are browser-reported estimates and may exclude native image surfaces.\n\n| Fixture | Strategy | Time (ms) | Max event-loop delay (ms) | Output (bytes) | Peak memory (bytes) |\n| --- | --- | ---: | ---: | ---: | ---: |\n${rows}\n`,
  );
});
