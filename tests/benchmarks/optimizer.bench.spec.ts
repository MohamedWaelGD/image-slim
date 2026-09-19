import { mkdirSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { expect, test } from '@playwright/test';
import {
  benchmarkFixtures,
  createFixtureFromAsset,
  useBuiltPackage,
} from '../browser/browser-utils';

const MIN_BENCHMARK_RUNS = 10;
const DEFAULT_BENCHMARK_RUNS = 20;

type SingleStrategy = 'main-thread' | 'worker';
type BatchStrategy = 'sequential' | 'promise-all' | 'bounded-concurrency-2';

interface BenchmarkMeasurement {
  fixture: string;
  width: number;
  height: number;
  megapixels: number;
  strategy: SingleStrategy;
  run: number;
  durationMs: number;
  longTaskObserverSupported: boolean;
  longTaskCount: number;
  longTaskDurationMs: number;
  maxEventLoopDelayMs: number;
  memoryBeforeBytes: number | null;
  memoryAfterBytes: number | null;
  memorySource: 'measureUserAgentSpecificMemory' | 'jsHeapSize' | null;
  inputBytes: number;
  outputBytes: number;
  outputWidth: number;
  outputHeight: number;
  outputType: string;
  quality: number;
  targetSizeReached: boolean;
}

interface BatchMeasurement {
  workload: string;
  fixture: string;
  imageCount: number;
  megapixelsPerImage: number;
  totalMegapixels: number;
  strategy: BatchStrategy;
  run: number;
  durationMs: number;
  longTaskObserverSupported: boolean;
  longTaskCount: number;
  longTaskDurationMs: number;
  maxEventLoopDelayMs: number;
  memoryBeforeBytes: number | null;
  memoryAfterBytes: number | null;
  memorySource: 'measureUserAgentSpecificMemory' | 'jsHeapSize' | null;
  inputBytes: number;
  outputBytes: number;
  completedImages: number;
  targetSizeReached: boolean;
}

interface BrowserMemory {
  bytes: number;
}

interface NumericSummary {
  median: number;
  p95: number;
}

interface SingleSummary {
  fixture: string;
  width: number;
  height: number;
  megapixels: number;
  strategy: SingleStrategy;
  runs: number;
  durationMs: NumericSummary;
  maxEventLoopDelayMs: NumericSummary;
  longTaskCount: NumericSummary;
  longTaskDurationMs: NumericSummary;
  outputBytes: NumericSummary;
  longTaskObserverSupported: boolean;
  targetSizeReachedEveryRun: boolean;
}

interface BatchSummary {
  workload: string;
  fixture: string;
  imageCount: number;
  megapixelsPerImage: number;
  totalMegapixels: number;
  strategy: BatchStrategy;
  runs: number;
  durationMs: NumericSummary;
  maxEventLoopDelayMs: NumericSummary;
  longTaskCount: NumericSummary;
  longTaskDurationMs: NumericSummary;
  outputBytes: NumericSummary;
  longTaskObserverSupported: boolean;
  targetSizeReachedEveryRun: boolean;
}

const batchWorkloads = [
  { name: '1x24MP', fixture: '24MP', fixtureKey: '6000x4000', imageCount: 1 },
  { name: '3x12MP', fixture: '12MP', fixtureKey: '4000x3000', imageCount: 3 },
  { name: '5x12MP', fixture: '12MP', fixtureKey: '4000x3000', imageCount: 5 },
  { name: '10x2MP', fixture: '2MP', fixtureKey: '1600x1250', imageCount: 10 },
] as const;

test.describe.configure({ mode: 'serial' });
test.setTimeout(1_800_000);

function readBenchmarkRuns(): number {
  const configuredRuns = Number.parseInt(
    process.env.BENCHMARK_RUNS ?? String(DEFAULT_BENCHMARK_RUNS),
    10,
  );

  if (!Number.isInteger(configuredRuns) || configuredRuns < MIN_BENCHMARK_RUNS) {
    throw new Error(
      `BENCHMARK_RUNS must be an integer of at least ${MIN_BENCHMARK_RUNS}.`,
    );
  }

  return configuredRuns;
}

function summarize(values: number[]): NumericSummary {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (fraction: number): number => {
    const position = (sorted.length - 1) * fraction;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const lowerValue = sorted[lower];
    const upperValue = sorted[upper];

    if (lowerValue === undefined || upperValue === undefined) {
      throw new Error('Cannot summarize an empty measurement group.');
    }

    return lowerValue + (upperValue - lowerValue) * (position - lower);
  };

  return {
    median: percentile(0.5),
    p95: percentile(0.95),
  };
}

function formatSummary(summary: NumericSummary): string {
  return `${summary.median.toFixed(1)} / ${summary.p95.toFixed(1)}`;
}

function summarizeSingleMeasurements(
  measurements: BenchmarkMeasurement[],
): SingleSummary[] {
  const groups = new Map<string, BenchmarkMeasurement[]>();

  for (const measurement of measurements) {
    const key = `${measurement.fixture}:${measurement.strategy}`;
    const group = groups.get(key) ?? [];
    group.push(measurement);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];

    if (!first) {
      throw new Error('Cannot summarize an empty measurement group.');
    }

    return {
      fixture: first.fixture,
      width: first.width,
      height: first.height,
      megapixels: first.megapixels,
      strategy: first.strategy,
      runs: group.length,
      durationMs: summarize(group.map((measurement) => measurement.durationMs)),
      maxEventLoopDelayMs: summarize(
        group.map((measurement) => measurement.maxEventLoopDelayMs),
      ),
      longTaskCount: summarize(group.map((measurement) => measurement.longTaskCount)),
      longTaskDurationMs: summarize(
        group.map((measurement) => measurement.longTaskDurationMs),
      ),
      outputBytes: summarize(group.map((measurement) => measurement.outputBytes)),
      longTaskObserverSupported: group.every(
        (measurement) => measurement.longTaskObserverSupported,
      ),
      targetSizeReachedEveryRun: group.every(
        (measurement) => measurement.targetSizeReached,
      ),
    };
  });
}

function summarizeBatchMeasurements(measurements: BatchMeasurement[]): BatchSummary[] {
  const groups = new Map<string, BatchMeasurement[]>();

  for (const measurement of measurements) {
    const key = `${measurement.workload}:${measurement.strategy}`;
    const group = groups.get(key) ?? [];
    group.push(measurement);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];

    if (!first) {
      throw new Error('Cannot summarize an empty batch measurement group.');
    }

    return {
      workload: first.workload,
      fixture: first.fixture,
      imageCount: first.imageCount,
      megapixelsPerImage: first.megapixelsPerImage,
      totalMegapixels: first.totalMegapixels,
      strategy: first.strategy,
      runs: group.length,
      durationMs: summarize(group.map((measurement) => measurement.durationMs)),
      maxEventLoopDelayMs: summarize(
        group.map((measurement) => measurement.maxEventLoopDelayMs),
      ),
      longTaskCount: summarize(group.map((measurement) => measurement.longTaskCount)),
      longTaskDurationMs: summarize(
        group.map((measurement) => measurement.longTaskDurationMs),
      ),
      outputBytes: summarize(group.map((measurement) => measurement.outputBytes)),
      longTaskObserverSupported: group.every(
        (measurement) => measurement.longTaskObserverSupported,
      ),
      targetSizeReachedEveryRun: group.every(
        (measurement) => measurement.targetSizeReached,
      ),
    };
  });
}

test('records repeated single-image and batch optimization performance', async ({
  page,
}) => {
  const runs = readBenchmarkRuns();
  await useBuiltPackage(page, true);

  for (const fixture of benchmarkFixtures) {
    await createFixtureFromAsset(page, fixture);
  }

  // Keep module loading out of the first measured operation.
  await page.evaluate(async () => {
    await import('/dist/index.js');
  });

  const measurements: BenchmarkMeasurement[] = [];
  const batchMeasurements: BatchMeasurement[] = [];

  for (const fixture of benchmarkFixtures) {
    for (let run = 0; run < runs; run += 1) {
      for (const strategy of ['main-thread', 'worker'] as const) {
        const measurement = await page.evaluate(
          async ({ fixtureKey, fixtureName, width, height, strategy, run }) => {
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

            const readMemory = async (): Promise<{
              bytes: number;
              source: 'measureUserAgentSpecificMemory' | 'jsHeapSize';
            } | null> => {
              try {
                if (performanceWithMemory.measureUserAgentSpecificMemory) {
                  return {
                    bytes: (await performanceWithMemory.measureUserAgentSpecificMemory())
                      .bytes,
                    source: 'measureUserAgentSpecificMemory',
                  };
                }
              } catch {
                // The API requires browser permissions that are not always available.
              }

              const bytes = performanceWithMemory.memory?.usedJSHeapSize;
              return bytes === undefined ? null : { bytes, source: 'jsHeapSize' };
            };

            const longTaskEntries: PerformanceEntry[] = [];
            const longTaskObserverSupported =
              PerformanceObserver.supportedEntryTypes?.includes('longtask') ?? false;
            const longTaskObserver = longTaskObserverSupported
              ? new PerformanceObserver((list) => {
                  longTaskEntries.push(...list.getEntries());
                })
              : null;

            longTaskObserver?.observe({ type: 'longtask', buffered: true });
            const memoryBefore = await readMemory();
            let maxEventLoopDelayMs = 0;
            let lastHeartbeat = performance.now();
            const heartbeat = window.setInterval(() => {
              const now = performance.now();
              maxEventLoopDelayMs = Math.max(maxEventLoopDelayMs, now - lastHeartbeat);
              lastHeartbeat = now;
            }, 16);
            const { optimizeImage } = await import('/dist/index.js');
            const startedAt = performance.now();
            const result = await optimizeImage(source, {
              processing: strategy,
              maxWidth: 1920,
              maxHeight: 1920,
              targetSize: 1_000_000,
              maxInputSize: 100_000_000,
            });
            const endedAt = performance.now();

            // Let the heartbeat and PerformanceObserver callbacks run before sampling.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            clearInterval(heartbeat);
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            const memoryAfter = await readMemory();
            longTaskObserver?.disconnect();

            const longTasks = longTaskEntries.filter(
              (entry) =>
                entry.startTime < endedAt &&
                entry.startTime + entry.duration >= startedAt,
            );

            return {
              fixture: fixtureName,
              width,
              height,
              megapixels: (width * height) / 1_000_000,
              strategy,
              run,
              durationMs: endedAt - startedAt,
              longTaskObserverSupported,
              longTaskCount: longTasks.length,
              longTaskDurationMs: longTasks.reduce(
                (total, entry) => total + entry.duration,
                0,
              ),
              maxEventLoopDelayMs,
              memoryBeforeBytes: memoryBefore?.bytes ?? null,
              memoryAfterBytes: memoryAfter?.bytes ?? null,
              memorySource: memoryBefore?.source ?? memoryAfter?.source ?? null,
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
            run,
          },
        );

        measurements.push(measurement);
      }
    }
  }

  for (const workload of batchWorkloads) {
    const fixture = benchmarkFixtures.find(
      (candidate) => candidate.name === workload.fixture,
    );

    if (!fixture) {
      throw new Error(`The ${workload.fixture} fixture is missing.`);
    }

    for (let run = 0; run < runs; run += 1) {
      for (const strategy of [
        'sequential',
        'promise-all',
        'bounded-concurrency-2',
      ] as const) {
        const measurement = await page.evaluate(
          async ({ workload, fixtureKey, fixtureName, megapixels, strategy, run }) => {
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

            const readMemory = async (): Promise<{
              bytes: number;
              source: 'measureUserAgentSpecificMemory' | 'jsHeapSize';
            } | null> => {
              try {
                if (performanceWithMemory.measureUserAgentSpecificMemory) {
                  return {
                    bytes: (await performanceWithMemory.measureUserAgentSpecificMemory())
                      .bytes,
                    source: 'measureUserAgentSpecificMemory',
                  };
                }
              } catch {
                // The API requires browser permissions that are not always available.
              }

              const bytes = performanceWithMemory.memory?.usedJSHeapSize;
              return bytes === undefined ? null : { bytes, source: 'jsHeapSize' };
            };

            const longTaskEntries: PerformanceEntry[] = [];
            const longTaskObserverSupported =
              PerformanceObserver.supportedEntryTypes?.includes('longtask') ?? false;
            const longTaskObserver = longTaskObserverSupported
              ? new PerformanceObserver((list) => {
                  longTaskEntries.push(...list.getEntries());
                })
              : null;

            longTaskObserver?.observe({ type: 'longtask', buffered: true });
            const memoryBefore = await readMemory();
            let maxEventLoopDelayMs = 0;
            let lastHeartbeat = performance.now();
            const heartbeat = window.setInterval(() => {
              const now = performance.now();
              maxEventLoopDelayMs = Math.max(maxEventLoopDelayMs, now - lastHeartbeat);
              lastHeartbeat = now;
            }, 16);
            const { optimizeImage, optimizeImages } = await import('/dist/index.js');
            const startedAt = performance.now();
            const options = {
              processing: 'worker' as const,
              maxWidth: 1920,
              maxHeight: 1920,
              targetSize: 1_000_000,
              maxInputSize: 100_000_000,
            };
            const sources = Array.from({ length: workload.imageCount }, () => source);
            let results;

            if (strategy === 'sequential') {
              results = [];
              for (const image of sources) {
                results.push(await optimizeImage(image, options));
              }
            } else if (strategy === 'promise-all') {
              results = await Promise.all(
                sources.map((image) => optimizeImage(image, options)),
              );
            } else {
              results = await optimizeImages(sources, {
                ...options,
                concurrency: 2,
              });
            }

            const endedAt = performance.now();
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            clearInterval(heartbeat);
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            const memoryAfter = await readMemory();
            longTaskObserver?.disconnect();

            const longTasks = longTaskEntries.filter(
              (entry) =>
                entry.startTime < endedAt &&
                entry.startTime + entry.duration >= startedAt,
            );

            return {
              workload: workload.name,
              fixture: fixtureName,
              imageCount: workload.imageCount,
              megapixelsPerImage: megapixels,
              totalMegapixels: megapixels * workload.imageCount,
              strategy,
              run,
              durationMs: endedAt - startedAt,
              longTaskObserverSupported,
              longTaskCount: longTasks.length,
              longTaskDurationMs: longTasks.reduce(
                (total, entry) => total + entry.duration,
                0,
              ),
              maxEventLoopDelayMs,
              memoryBeforeBytes: memoryBefore?.bytes ?? null,
              memoryAfterBytes: memoryAfter?.bytes ?? null,
              memorySource: memoryBefore?.source ?? memoryAfter?.source ?? null,
              inputBytes: source.size * workload.imageCount,
              outputBytes: results.reduce(
                (total, result) => total + result.optimized.size,
                0,
              ),
              completedImages: results.length,
              targetSizeReached: results.every((result) => result.targetSizeReached),
            } satisfies BatchMeasurement;
          },
          {
            workload,
            fixtureKey: workload.fixtureKey,
            fixtureName: fixture.name,
            megapixels: (fixture.width * fixture.height) / 1_000_000,
            strategy,
            run,
          },
        );

        batchMeasurements.push(measurement);
      }
    }
  }

  const summaries = summarizeSingleMeasurements(measurements);
  const batchSummaries = summarizeBatchMeasurements(batchMeasurements);
  const longTaskObserverSupported = measurements
    .concat(batchMeasurements)
    .every((measurement) => measurement.longTaskObserverSupported);

  expect(measurements).toHaveLength(benchmarkFixtures.length * 2 * runs);
  expect(batchMeasurements).toHaveLength(batchWorkloads.length * 3 * runs);

  mkdirSync('benchmark-results', { recursive: true });
  writeFileSync(
    'benchmark-results/latest.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        platform: platform(),
        browser: 'chromium',
        runs,
        methodology: {
          minimumRuns: MIN_BENCHMARK_RUNS,
          statistics: 'median and linearly interpolated p95 across all runs',
          longTaskObserverSupported,
          memory: 'diagnostic browser samples only; not a native allocation peak',
        },
        summaries,
        batchSummaries,
        measurements,
        batchMeasurements,
      },
      null,
      2,
    ),
  );

  const singleRows = summaries
    .map(
      (summary) =>
        `| ${summary.fixture} | ${summary.strategy} | ${summary.runs} | ${formatSummary(summary.durationMs)} | ${formatSummary(summary.maxEventLoopDelayMs)} | ${formatSummary(summary.longTaskCount)} | ${formatSummary(summary.outputBytes)} | ${summary.targetSizeReachedEveryRun ? 'yes' : 'no'} |`,
    )
    .join('\n');
  const batchRows = batchSummaries
    .map(
      (summary) =>
        `| ${summary.workload} | ${summary.strategy} | ${summary.runs} | ${formatSummary(summary.durationMs)} | ${formatSummary(summary.maxEventLoopDelayMs)} | ${formatSummary(summary.longTaskCount)} | ${summary.targetSizeReachedEveryRun ? 'yes' : 'no'} |`,
    )
    .join('\n');

  writeFileSync(
    'benchmark-results/latest.md',
    `# ImageSlim Performance Benchmark

Generated: ${new Date().toISOString()}

Each case ran ${runs} times. Time and event-loop values are reported as **median / p95** in milliseconds. Long-task counts are only suitable for claims when the Long Tasks PerformanceObserver is supported and delivery was observed after each operation. Observer supported for this run: **${longTaskObserverSupported ? 'yes' : 'no'}**.

## Single-image strategies

| Fixture | Strategy | Runs | Time median / p95 (ms) | Event-loop delay median / p95 (ms) | Long tasks median / p95 | Output median / p95 (bytes) | Target reached every run |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
${singleRows}

## Batch workloads

Batch cases use Worker processing and compare sequential work, uncontrolled Promise.all, and the public bounded-concurrency-2 API. Input workloads are 1 x 24MP, 3 x 12MP, 5 x 12MP, and 10 x 2MP.

| Workload | Strategy | Runs | Time median / p95 (ms) | Event-loop delay median / p95 (ms) | Long tasks median / p95 | Target reached every run |
| --- | --- | ---: | ---: | ---: | ---: | --- |
${batchRows}

Memory fields in the JSON are browser-reported diagnostic samples. They do not represent ImageSlim peak RAM and exclude or incompletely represent native decoder/encoder allocations, ImageBitmap and canvas backing stores, and GPU resources.
`,
  );
});
