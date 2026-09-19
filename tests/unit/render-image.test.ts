import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareImageRenderer } from '../../src/browser/render-image';

class FakeContext {
  drawCalls = 0;
  imageSmoothingEnabled = false;
  imageSmoothingQuality: ImageSmoothingQuality = 'low';
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  fillStyle = '';

  drawImage(): void {
    this.drawCalls += 1;
  }

  save(): void {}

  fillRect(): void {}

  restore(): void {}
}

class FakeOffscreenCanvas {
  static lastInstance: FakeOffscreenCanvas | undefined;

  width: number;
  height: number;
  readonly context = new FakeContext();
  encodeCalls = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    FakeOffscreenCanvas.lastInstance = this;
  }

  getContext(): FakeContext {
    return this.context;
  }

  async convertToBlob(options: { type: string; quality: number }): Promise<Blob> {
    this.encodeCalls += 1;
    const size = Math.round(100 + options.quality * 1_000);
    return new Blob(['x'.repeat(size)], { type: options.type });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeOffscreenCanvas.lastInstance = undefined;
});

describe('prepareImageRenderer', () => {
  it('draws once and reuses the prepared canvas for every encode', async () => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const renderer = prepareImageRenderer(
      {} as ImageBitmap,
      { width: 60, height: 40 },
      'webp',
      '#ffffff',
    );
    const canvas = FakeOffscreenCanvas.lastInstance;

    await renderer.encode(0.82);
    await renderer.encode(0.4);
    await renderer.encode(0.61);

    expect(canvas?.context.drawCalls).toBe(1);
    expect(canvas?.encodeCalls).toBe(3);

    renderer.dispose();

    expect(canvas?.width).toBe(0);
    expect(canvas?.height).toBe(0);
  });

  it('falls back to a DOM canvas when OffscreenCanvas is unusable', async () => {
    const domContext = new FakeContext();
    const domCanvas = {
      width: 0,
      height: 0,
      getContext: () => domContext,
      toBlob: (callback: BlobCallback, type?: string, quality?: number): void => {
        const size = Math.round(100 + (quality ?? 0) * 1_000);
        callback(new Blob(['x'.repeat(size)], { type }));
      },
    };

    class BrokenOffscreenCanvas {
      constructor() {
        throw new Error('OffscreenCanvas is unavailable.');
      }
    }

    vi.stubGlobal('OffscreenCanvas', BrokenOffscreenCanvas);
    vi.stubGlobal('document', {
      createElement: () => domCanvas,
    });

    const renderer = prepareImageRenderer(
      {} as HTMLImageElement,
      { width: 60, height: 40 },
      'webp',
      '#ffffff',
    );

    const blob = await renderer.encode(0.82);

    expect(blob.type).toBe('image/webp');
    expect(domContext.drawCalls).toBe(1);

    renderer.dispose();

    expect(domCanvas.width).toBe(0);
    expect(domCanvas.height).toBe(0);
  });
});
