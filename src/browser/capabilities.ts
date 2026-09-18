export function supportsImageBitmap(): boolean {
  return typeof createImageBitmap === 'function';
}

export function supportsOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas !== 'undefined';
}

export function supportsDomCanvas(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}
