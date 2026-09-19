import { afterEach, describe, expect, it, vi } from 'vitest';
import { optimizeImage } from '../../src/core/optimize-image';

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
  static onFirstEncode: (() => void) | undefined;

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
    if (this.encodeCalls === 1) {
      FakeOffscreenCanvas.onFirstEncode?.();
    }

    const size = Math.round(100 + options.quality * 1_000);
    return new Blob(['x'.repeat(size)], { type: options.type });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeOffscreenCanvas.lastInstance = undefined;
  FakeOffscreenCanvas.onFirstEncode = undefined;
});

describe('optimizeImage', () => {
  it('reports an unavailable worker when worker processing is required', async () => {
    await expect(
      optimizeImage(new Blob(['image'], { type: 'image/png' }), {
        processing: 'worker',
      }),
    ).rejects.toMatchObject({ code: 'WORKER_UNAVAILABLE' });
  });

  it('rejects oversized input dimensions before decoding', async () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 20_000);
    view.setUint32(20, 20_000);
    const createImageBitmapMock = vi.fn();

    vi.stubGlobal('createImageBitmap', createImageBitmapMock);

    await expect(
      optimizeImage(new Blob([bytes], { type: 'image/png' }), {
        processing: 'main-thread',
      }),
    ).rejects.toMatchObject({ code: 'INPUT_DIMENSIONS_TOO_LARGE' });

    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it('stops before decoding when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort('cancelled');

    await expect(
      optimizeImage(new Blob(['image'], { type: 'image/png' }), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('cancels between encode attempts and releases resources', async () => {
    const controller = new AbortController();
    const close = vi.fn();
    FakeOffscreenCanvas.onFirstEncode = () => controller.abort('cancelled');

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({
        width: 120,
        height: 80,
        close,
      }),
    );
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    await expect(
      optimizeImage(new Blob(['image'], { type: 'image/png' }), {
        format: 'webp',
        targetSize: 700,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });

    const canvas = FakeOffscreenCanvas.lastInstance;
    expect(canvas?.context.drawCalls).toBe(1);
    expect(canvas?.encodeCalls).toBe(1);
    expect(canvas?.width).toBe(0);
    expect(canvas?.height).toBe(0);
    expect(close).toHaveBeenCalledOnce();
  });
});
