import type { ImageDimensions } from '../types/public';

export function calculateDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
  allowUpscale = false,
): ImageDimensions {
  const scale = Math.min(maxWidth / width, maxHeight / height);
  const finalScale = allowUpscale ? scale : Math.min(scale, 1);

  return {
    width: Math.max(1, Math.round(width * finalScale)),
    height: Math.max(1, Math.round(height * finalScale)),
  };
}
