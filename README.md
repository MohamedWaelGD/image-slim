# ImageSlim

Framework-agnostic browser image resizing and compression for TypeScript and JavaScript.

ImageSlim has no Angular, React, Vue, or Svelte dependencies. It accepts a `Blob`, uses
browser image APIs, and returns an optimized `Blob` with useful metadata.

## Contents

- [Install](#install)
- [Usage](#usage)
- [Batch usage](#batch-usage)
- [How it works](#how-it-works)
- [API](#api)
- [Browser behavior](#browser-behavior)
- [Cancellation](#cancellation)
- [Angular](#angular)
- [React](#react)
- [Vue](#vue)
- [Native browser](#native-browser)
- [Bundler compatibility](#bundler-compatibility)
- [Performance testing](#performance-testing)
- [Local package testing](#local-package-testing)
- [License](#license)

## How it works

ImageSlim keeps the original decoded image in memory and prepares one resized canvas for
the output. Every quality attempt is encoded from that same canvas, which avoids repeating
the resize and draw work while the quality search compares output sizes.

The image is validated and decoded once, then resized and drawn to a canvas once. WebP and
JPEG outputs use a quality search that encodes the prepared canvas repeatedly, while PNG
is encoded once. The result is verified, temporary resources are released, and the
optimized `Blob` and metadata are returned.

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

## Install

```bash
npm install @mohamedwaelgd/image-slim
```

[Back to contents](#contents)

## Usage

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

[Back to contents](#contents)

## Batch usage

Use `optimizeImages` for a bounded batch. Results preserve the input order, and the default
concurrency is `2`, which is intentionally conservative for large phone photos.

```ts
import { optimizeImages } from '@mohamedwaelgd/image-slim';

const results = await optimizeImages(files, {
  concurrency: 2,
  processing: 'worker',
  format: 'webp',
});
```

The batch is fail-fast. When one image fails, queued images are not started and active images
are cancelled. An external `AbortSignal` cancels queued and active work. `concurrency` must be
a positive integer.

[Back to contents](#contents)

## API

```ts
interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  format?: 'webp' | 'jpeg' | 'png';
  quality?: number;
  targetSize?: number;
  maxInputSize?: number;
  allowUpscale?: boolean;
  backgroundColor?: string;
  signal?: AbortSignal;
  processing?: 'auto' | 'worker' | 'main-thread';
}

interface BatchImageOptimizationOptions extends ImageOptimizationOptions {
  concurrency?: number;
}
```

Defaults are `1920 x 1920`, WebP, quality `0.82`, a `1,000,000` byte target, a
`15,000,000` byte maximum input size, and automatic processing strategy selection. Images
are not enlarged unless `allowUpscale` is set to `true`.

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
- `createImageBitmap` is preferred, with an HTML image fallback.
- `OffscreenCanvas` is preferred when it can be initialized, with regular canvas fallback.
- `OffscreenCanvas` runs on the calling thread; it does not automatically create a worker.
- `processing: 'auto'` uses the packaged module worker when available and falls back to the
  main thread; use `'worker'` to require a worker or `'main-thread'` to opt out.
- EXIF orientation is requested through `createImageBitmap`.
- Aspect ratio is preserved and images are not enlarged by default.
- Quality search encodes every attempt from the same prepared canvas.
- Transparent pixels are composited onto white when producing JPEG. Set `backgroundColor`
  to use another CSS color.
- Unsupported input types, output encoders, invalid options, and unavailable canvas APIs
  throw `ImageSlimError` with a stable `code`.
- `optimizeImages` limits the number of simultaneous image operations; it does not create a
  permanent Worker pool. Each active Worker request is cleaned up when it settles.

The package targets modern browsers with Canvas support. Run the Chromium smoke tests
locally with `npm run test:browser`.

[Back to contents](#contents)

## Bundler compatibility

The browser package uses the standard module Worker pattern and should be consumed through its
ESM entry point. Production build fixtures cover Angular's esbuild builder, Vite, Webpack 5,
Next.js/React, and Vue/Vite.

Run the packed-package build matrix with:

```bash
npm run test:integrations
```

The integration runner builds the applications under `E:\Projects\demo\test-demos` and checks
that each output contains an ImageSlim Worker artifact. The application must deploy the emitted
Worker and its shared chunks together; `processing: 'auto'` can hide a missing Worker by falling
back to the main thread, so integration checks use `processing: 'worker'`.

[Back to contents](#contents)

## Performance testing

Run the browser benchmark suite with:

```bash
npm run benchmark
```

The suite prepares 0.5MP, 2MP, 12MP, and 24MP fixtures from the images in `tests/assets` and
measures main-thread and Worker processing. It records total time, long tasks, event-loop delay,
input/output sizes, and browser-reported memory estimates in `benchmark-results/latest.json` and
`benchmark-results/latest.md`.

Large-image stress tests are opt-in because decoded pixels use substantially more memory than
compressed file bytes:

```bash
npm run test:stress
```

Memory values are diagnostic only. Browser APIs do not consistently expose native bitmap and
canvas allocations, so timing and memory are not used as strict CI thresholds.

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
