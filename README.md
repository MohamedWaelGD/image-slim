# ImageSlim

Client-side image optimization for the browser. Resize, compress, and convert user
uploads before they ever leave the device, so your users upload less, your backend
processes less, and your storage stays smaller.

- Resize large uploads while preserving aspect ratio.
- Compress and convert to WebP, JPEG, or PNG.
- Target a maximum output file size.
- Process off the main thread with a Web Worker, with main-thread fallback.
- Optimize batches with controlled concurrency and progress reporting.
- Reject oversized inputs before decoding them.
- Works with Angular, React, Vue, Svelte, or plain JavaScript.
- TypeScript types, ESM and CJS builds, and zero runtime dependencies.

## Install

```bash
npm install @mohamedwaelgd/image-slim
```

## Quick start

```ts
import { optimizeImage } from '@mohamedwaelgd/image-slim';

const result = await optimizeImage(file, {
  maxWidth: 1920,
  maxHeight: 1080,
  format: 'webp',
  quality: 0.82,
  targetSize: 700_000,
});

const formData = new FormData();
formData.append('file', result.blob, 'image.webp');
```

`File` objects work automatically because `File` extends `Blob`.

## Batch with progress

Use `optimizeImages` for a bounded batch. Results preserve input order, the default
concurrency is `2`, and `onProgress` reports each completed image.

```ts
import { optimizeImages } from '@mohamedwaelgd/image-slim';

const results = await optimizeImages(files, {
  concurrency: 2,
  processing: 'worker',
  format: 'webp',
  onProgress: ({ completed, total, index }) => {
    console.log(`Optimized ${completed} of ${total} (input #${index})`);
  },
});
```

The batch is fail-fast. When one image fails, queued images are not started and active
images are cancelled. An external `AbortSignal` cancels queued and active work. A thrown
`onProgress` error also fails the batch. `concurrency` must be a positive integer.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Batch with progress](#batch-with-progress)
- [API](#api)
- [Browser behavior](#browser-behavior)
- [Error codes](#error-codes)
- [Cancellation](#cancellation)
- [How it works](#how-it-works)
- [Angular](#angular)
- [React](#react)
- [Vue](#vue)
- [Native browser](#native-browser)
- [Bundler compatibility](#bundler-compatibility)
- [Performance testing](#performance-testing)
- [Local package testing](#local-package-testing)
- [License](#license)

## API

```ts
interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  format?: 'webp' | 'jpeg' | 'png';
  quality?: number;
  targetSize?: number;
  maxInputSize?: number;
  maxInputWidth?: number;
  maxInputHeight?: number;
  maxInputPixels?: number;
  maxOutputPixels?: number;
  allowUpscale?: boolean;
  backgroundColor?: string;
  signal?: AbortSignal;
  processing?: 'auto' | 'worker' | 'main-thread';
}

interface BatchProgress {
  completed: number;
  total: number;
  index: number;
}

interface BatchImageOptimizationOptions extends ImageOptimizationOptions {
  concurrency?: number;
  onProgress?: (progress: BatchProgress) => void;
}
```

Defaults are `1920 x 1920`, WebP, quality `0.82`, a `1,000,000` byte target, a
`15,000,000` byte maximum input size, input limits of `16,384` per axis and
`40,000,000` pixels, a `40,000,000` pixel output limit, and automatic processing
strategy selection. Images are not enlarged unless `allowUpscale` is set to `true`.

The result includes original and optimized dimensions, sizes, MIME types, and the final
quality. If the target cannot be reached at the minimum quality, ImageSlim returns the
smallest attempt and sets `targetSizeReached` to `false`; it does not throw or silently
reduce dimensions.

```ts
interface OptimizedImageResult {
  blob: Blob;
  original: {
    size: number;
    width: number;
    height: number;
    type: string;
  };
  optimized: {
    size: number;
    width: number;
    height: number;
    type: string;
  };
  reductionPercentage: number;
  targetSizeReached: boolean;
  quality: number;
}
```

[Back to contents](#contents)

## Browser behavior

- JPEG, PNG, and WebP inputs are accepted.
- WebP, JPEG, and PNG outputs are supported when the browser encoder supports them.
- `createImageBitmap` is preferred, with an HTML image fallback when it is missing or
  fails.
- `OffscreenCanvas` is preferred when it can be initialized, with regular canvas fallback.
- `OffscreenCanvas` runs on the calling thread; it does not automatically create a worker.
- `processing: 'auto'` uses the packaged module worker when available and falls back to the
  main thread; use `'worker'` to require a worker or `'main-thread'` to opt out. Some
  browsers expose module workers but lack the worker-side `createImageBitmap`,
  `OffscreenCanvas`, or `convertToBlob` support needed for off-main-thread encoding; in
  that case `'worker'` throws `WORKER_UNAVAILABLE` and `'auto'` falls back to the main
  thread.
- EXIF orientation is requested through `createImageBitmap`.
- Aspect ratio is preserved and images are not enlarged by default.
- Quality search encodes every attempt from the same prepared canvas.
- Transparent pixels are composited onto white when producing JPEG. Set `backgroundColor`
  to use another CSS color.
- Unsupported input types, output encoders, invalid options, and unavailable canvas APIs
  throw `ImageSlimError` with a stable `code`.
- `optimizeImages` limits the number of simultaneous image operations; it does not create a
  permanent Worker pool. Each active Worker request is cleaned up when it settles.

### Input size versus input dimensions

`maxInputSize` limits the compressed byte size. `maxInputWidth`, `maxInputHeight`, and
`maxInputPixels` limit decoded dimensions. Compressed bytes are a poor proxy for decoded
memory: a small file can decode to a huge bitmap, so dimension limits are validated from
the image header before decoding and re-checked after decoding. `maxOutputPixels` limits
the canvas that will be allocated before encoding, which also bounds `allowUpscale`.

Header preflight significantly reduces oversized-image risk, but full decoding still
happens inside browser APIs that ImageSlim does not control.

### Browser support

The browser test suite runs against Chromium, Firefox, and Playwright's WebKit build.
WebKit is not the same as macOS or iOS Safari; treat WebKit results as strong evidence but
not Safari certification.

[Back to contents](#contents)

## Error codes

`ImageSlimError.code` is stable and safe to branch on:

| Code                          | Meaning                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `INVALID_INPUT`               | The input is not a `Blob`-like value.                          |
| `INVALID_INPUT_TYPE`          | The MIME type is not JPEG, PNG, or WebP.                       |
| `INPUT_TOO_LARGE`             | The compressed input exceeds `maxInputSize`.                   |
| `INPUT_DIMENSIONS_TOO_LARGE`  | Input dimensions exceed the configured axis or pixel limits.   |
| `OUTPUT_DIMENSIONS_TOO_LARGE` | The prepared output canvas exceeds `maxOutputPixels`.          |
| `INVALID_IMAGE_DIMENSIONS`    | The decoder reported zero, negative, or non-finite dimensions. |
| `INVALID_OPTIONS`             | An option value is out of range or the wrong type.             |
| `ABORTED`                     | The operation was cancelled through an `AbortSignal`.          |
| `WORKER_UNAVAILABLE`          | Worker processing was required but is not supported here.      |
| `WORKER_FAILED`               | The worker crashed, failed, or returned an invalid message.    |
| `DECODE_FAILED`               | The image could not be decoded.                                |
| `CANVAS_UNAVAILABLE`          | No usable canvas or 2D context is available.                   |
| `ENCODE_FAILED`               | The canvas returned no encoded image.                          |
| `UNSUPPORTED_OUTPUT_FORMAT`   | The browser returned a different MIME type than requested.     |

[Back to contents](#contents)

## Cancellation

Pass an `AbortSignal` to stop optimization before the next processing step or quality
attempt:

```ts
import { ImageSlimError, optimizeImage } from '@mohamedwaelgd/image-slim';

const controller = new AbortController();

const pending = optimizeImage(file, {
  format: 'webp',
  signal: controller.signal,
});

controller.abort();

try {
  await pending;
} catch (error) {
  if (error instanceof ImageSlimError && error.code === 'ABORTED') {
    // The operation was cancelled.
  }
}
```

Cancellation is cooperative. An encode already in progress may finish, but ImageSlim
will not start another attempt or return a result. Decoded images, canvases, and object
URLs are released when cancellation occurs.

[Back to contents](#contents)

## How it works

ImageSlim keeps the original decoded image in memory and prepares one resized canvas for
the output. Every quality attempt is encoded from that same canvas, which avoids repeating
the resize and draw work while the quality search compares output sizes.

The image is validated, dimension-checked from its header, and decoded once, then resized
and drawn to a canvas once. WebP and JPEG outputs use a quality search that encodes the
prepared canvas repeatedly, while PNG is encoded once. The result is verified, temporary
resources are released, and the optimized `Blob` and metadata are returned.

### Browser processing path

The implementation progressively selects the best browser API available. It prefers
modern APIs but still supports browsers that only provide the traditional image and
canvas interfaces.

The browser path prefers `createImageBitmap` for decoding and a usable `OffscreenCanvas`
for rendering. When those APIs are unavailable or cannot be initialized, ImageSlim falls
back to `HTMLImageElement` and regular HTML canvas APIs.

### Target-size quality search

For WebP and JPEG, `targetSize` is treated as a maximum byte size. The search keeps the
highest quality that fits. If the target is impossible at the minimum quality, the
smallest attempt is returned and `targetSizeReached` becomes `false`.

For WebP and JPEG, ImageSlim first tries the configured quality. If that exceeds the
target, it checks the minimum quality and then binary-searches for the highest quality
that fits. If the target is still impossible, it returns the smallest attempt.

[Back to contents](#contents)

## Angular

ImageSlim is consumed like any other browser library from Angular:

```ts
import { optimizeImage } from '@mohamedwaelgd/image-slim';

async function imageSelected(file: File) {
  const { blob } = await optimizeImage(file, { format: 'webp' });
  // Send blob with Angular HttpClient and FormData.
}
```

## React

ImageSlim can be used from a React file input handler:

```tsx
import type { ChangeEvent } from 'react';
import { optimizeImage } from '@mohamedwaelgd/image-slim';

function ImageInput() {
  async function imageSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const { blob } = await optimizeImage(file, { format: 'webp' });
    // Upload blob with fetch or your preferred client.
  }

  return <input type="file" accept="image/*" onChange={imageSelected} />;
}
```

## Vue

Use ImageSlim from a Vue change handler:

```vue
<script setup lang="ts">
import { optimizeImage } from '@mohamedwaelgd/image-slim';

async function imageSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const { blob } = await optimizeImage(file, { format: 'webp' });
  // Upload blob with fetch or your preferred client.
}
</script>

<template>
  <input type="file" accept="image/*" @change="imageSelected" />
</template>
```

## Native browser

ImageSlim also works with a plain browser file input and no UI framework:

```ts
import { optimizeImage } from '@mohamedwaelgd/image-slim';

const input = document.querySelector<HTMLInputElement>('#image-input');

input?.addEventListener('change', async () => {
  const file = input.files?.[0];
  if (!file) return;

  const { blob } = await optimizeImage(file, { format: 'webp' });
  // Upload blob with fetch or your preferred client.
});
```

[Back to contents](#contents)

## Bundler compatibility

The browser package uses the standard module Worker pattern and should be consumed through
its ESM entry point. Bundlers must deploy the emitted ImageSlim Worker and its shared chunks
together. A build that drops the Worker fails `processing: 'worker'` with
`WORKER_UNAVAILABLE`, while `processing: 'auto'` silently falls back to the main thread. To
confirm your build deployed the Worker, run a smoke test with `processing: 'worker'`.

[Back to contents](#contents)

## Performance testing

Run the browser benchmark suite with:

```bash
npm run benchmark
```

The suite prepares 0.5MP, 2MP, 12MP, and 24MP fixtures from the images in `tests/assets` and
measures main-thread and Worker processing. Each case runs 20 times by default; set
`BENCHMARK_RUNS` to another integer of at least 10 for a shorter or longer measurement set.
Reports use median and p95 rather than a single run. Separate batch workloads compare sequential
processing, uncontrolled `Promise.all`, and bounded concurrency for 1 x 24MP, 3 x 12MP, 5 x 12MP,
and 10 x 2MP inputs. Results are written to `benchmark-results/latest.json` and
`benchmark-results/latest.md`.

Large-image stress tests are opt-in because decoded pixels use substantially more memory than
compressed file bytes:

```bash
npm run test:stress
```

Memory values are diagnostic only and are not peak ImageSlim RAM measurements. Browser APIs do not
consistently expose native decoder/encoder allocations, ImageBitmap and canvas backing stores, or
GPU resources. Long-task counts are reported only with explicit observer-support metadata; the
benchmark waits for observer delivery before recording them.

[Back to contents](#contents)

## Local package testing

```bash
npm run validate:package
npm pack
```

Install the generated tarball from another application to test the same files that npm
consumers receive.

[Back to contents](#contents)

## License

MIT. See [LICENSE](./LICENSE).

[Back to contents](#contents)
