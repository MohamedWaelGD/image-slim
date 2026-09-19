import type { ValidatedOptions } from '../core/validate-options';
import type { ImageSlimErrorCode } from '../errors/image-slim-error';
import type { OptimizedImageResult } from '../types/public';

export type WorkerOptimizationOptions = Omit<ValidatedOptions, 'signal' | 'processing'>;

export interface OptimizeWorkerRequest {
  type: 'optimize';
  id: number;
  file: Blob;
  options: WorkerOptimizationOptions;
}

export interface CancelWorkerRequest {
  type: 'cancel';
  id: number;
}

export type WorkerRequest = OptimizeWorkerRequest | CancelWorkerRequest;

export interface WorkerResultResponse {
  type: 'result';
  id: number;
  result: OptimizedImageResult;
}

export interface WorkerErrorResponse {
  type: 'error';
  id: number;
  error: {
    code: ImageSlimErrorCode;
    message: string;
  };
}

export type WorkerResponse = WorkerResultResponse | WorkerErrorResponse;
