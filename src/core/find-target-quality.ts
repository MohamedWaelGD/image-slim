export interface QualitySearchResult {
  blob: Blob;
  quality: number;
  targetSizeReached: boolean;
}

export async function findQualityForTargetSize(
  encode: (quality: number) => Promise<Blob>,
  targetBytes: number,
  minQuality = 0.4,
  maxQuality = 0.9,
  iterations = 6,
): Promise<QualitySearchResult> {
  const lowerQuality = Math.min(minQuality, maxQuality);
  const highestQualityBlob = await encode(maxQuality);

  if (highestQualityBlob.size <= targetBytes) {
    return {
      blob: highestQualityBlob,
      quality: maxQuality,
      targetSizeReached: true,
    };
  }

  const lowestQualityBlob = await encode(lowerQuality);

  if (lowestQualityBlob.size > targetBytes) {
    return {
      blob: lowestQualityBlob,
      quality: lowerQuality,
      targetSizeReached: false,
    };
  }

  let low = lowerQuality;
  let high = maxQuality;
  let bestBlob = lowestQualityBlob;
  let bestQuality = lowerQuality;

  for (let index = 0; index < iterations; index += 1) {
    const quality = (low + high) / 2;
    const blob = await encode(quality);

    if (blob.size <= targetBytes) {
      bestBlob = blob;
      bestQuality = quality;
      low = quality;
    } else {
      high = quality;
    }
  }

  return {
    blob: bestBlob,
    quality: bestQuality,
    targetSizeReached: true,
  };
}
