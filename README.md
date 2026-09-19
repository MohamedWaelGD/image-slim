# ImageSlim

Framework-agnostic browser image resizing and compression for TypeScript and JavaScript.

ImageSlim has no Angular, React, Vue, or Svelte dependencies. It accepts a `Blob`, uses
browser image APIs, and returns an optimized `Blob` with useful metadata.

## Contents

- [Install](#install)
- [Usage](#usage)
- [How it works](#how-it-works)
- [API](#api)
- [Browser behavior](#browser-behavior)
- [Angular](#angular)
- [React](#react)
- [Vue](#vue)
- [Native browser](#native-browser)
- [Local package testing](#local-package-testing)
- [License](#license)

## How it works

ImageSlim keeps the original decoded image in memory and renders every output attempt
from that same source. This makes resizing deterministic and allows the quality search to
compare output sizes without repeatedly decoding the input.

The image is validated, decoded, resized, and drawn to a canvas. WebP and JPEG outputs
use a quality search to stay within the target size, while PNG is encoded once. The result
is verified, temporary resources are released, and the optimized `Blob` and metadata are
returned.

### Browser processing path

The implementation progressively selects the best browser API available. It prefers
modern APIs but still supports browsers that only provide the traditional image and
canvas interfaces.

The browser path prefers `createImageBitmap` for decoding and `OffscreenCanvas` for
encoding. When either API is unavailable, ImageSlim falls back to `HTMLImageElement` and
regular HTML canvas APIs.

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
}
```

Defaults are `1920 x 1920`, WebP, quality `0.82`, a `1,000,000` byte target, and a
`15,000,000` byte maximum input size. Images are not enlarged unless `allowUpscale` is
set to `true`.

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
- `OffscreenCanvas` is preferred, with regular canvas fallback.
- EXIF orientation is requested through `createImageBitmap`.
- Aspect ratio is preserved and images are not enlarged by default.
- Quality search encodes every attempt from the same decoded source.
- Transparent pixels are composited onto white when producing JPEG. Set `backgroundColor`
  to use another CSS color.
- Unsupported input types, output encoders, invalid options, and unavailable canvas APIs
  throw `ImageSlimError` with a stable `code`.

The package targets modern browsers with Canvas support. Run the Chromium smoke tests
locally with `npm run test:browser`.

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
