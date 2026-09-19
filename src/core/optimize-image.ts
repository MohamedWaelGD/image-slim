import { optimizeImageWithValidatedOptions } from './optimize-main-thread';
import { isWorkerFailure, optimizeImageInWorker } from '../worker/worker-client';
import { validateOptions } from './validate-options';
import type { ImageOptimizationOptions, OptimizedImageResult } from '../types/public';

export async function optimizeImage(
  file: Blob,
  options: ImageOptimizationOptions = {},
): Promise<OptimizedImageResult> {
  const config = validateOptions(options);

  if (config.processing === 'main-thread') {
    return optimizeImageWithValidatedOptions(file, config);
  }

  try {
    return await optimizeImageInWorker(file, config);
  } catch (error) {
    if (config.processing === 'auto' && isWorkerFailure(error)) {
      return optimizeImageWithValidatedOptions(file, {
        ...config,
        processing: 'main-thread',
      });
    }

    throw error;
  }
}
