import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

const distPath = resolve('dist');
const assetPath = resolve('tests/assets');
const sharedChunk = readdirSync(distPath).find((file) => /^chunk-.*\.js$/.test(file));

if (!sharedChunk) {
  throw new Error('Could not find the built shared ESM chunk.');
}

const packageFiles = new Map([
  ['/dist/index.js', readFileSync(resolve(distPath, 'index.js'), 'utf8')],
  [`/dist/${sharedChunk}`, readFileSync(resolve(distPath, sharedChunk), 'utf8')],
  [
    '/dist/worker/image-slim.worker.js',
    readFileSync(resolve(distPath, 'worker/image-slim.worker.js'), 'utf8'),
  ],
]);

const assetFiles = new Map(
  readdirSync(assetPath)
    .filter((file) => file.endsWith('.jpg'))
    .map((file) => [`/assets/${file}`, readFileSync(resolve(assetPath, file))] as const),
);

export async function useBuiltPackage(page: Page, includeAssets = false): Promise<void> {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());

    if (url.hostname !== 'image-slim.test') {
      await route.abort();
      return;
    }

    if (url.pathname === '/index.html') {
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html></html>',
      });
      return;
    }

    const packageFile = packageFiles.get(url.pathname);
    if (packageFile) {
      await route.fulfill({ contentType: 'text/javascript', body: packageFile });
      return;
    }

    if (includeAssets) {
      const asset = assetFiles.get(url.pathname);
      if (asset) {
        await route.fulfill({ contentType: 'image/jpeg', body: asset });
        return;
      }
    }

    await route.abort();
  });

  await page.goto('http://image-slim.test/index.html');
}

export interface BrowserFixtureSpec {
  name: string;
  source: string;
  width: number;
  height: number;
}

export const benchmarkFixtures: BrowserFixtureSpec[] = [
  { name: '0.5MP', source: '0.5mb.jpg', width: 800, height: 625 },
  { name: '2MP', source: '0.5mb.jpg', width: 1600, height: 1250 },
  { name: '12MP', source: '12mb.jpg', width: 4000, height: 3000 },
  { name: '24MP', source: '25mb.jpg', width: 6000, height: 4000 },
];

export async function createFixtureFromAsset(
  page: Page,
  fixture: BrowserFixtureSpec,
): Promise<void> {
  await page.evaluate(async ({ source, width, height }) => {
    const sourceBlob = await fetch(`/assets/${source}`).then((response) =>
      response.blob(),
    );
    const bitmap = await createImageBitmap(sourceBlob);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    if (!context) {
      bitmap.close();
      throw new Error('Could not create fixture canvas.');
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (encoded) =>
          encoded ? resolve(encoded) : reject(new Error('Could not encode fixture.')),
        'image/jpeg',
        0.92,
      );
    });

    const store = ((
      globalThis as unknown as { __imageSlimFixtures?: Record<string, Blob> }
    ).__imageSlimFixtures ??= {});
    store[`${width}x${height}`] = blob;
  }, fixture);
}
