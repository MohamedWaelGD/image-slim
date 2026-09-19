import type { ImageDimensions } from '../types/public';

const INITIAL_PROBE_BYTES = 64 * 1024;
const MAX_PROBE_BYTES = 512 * 1024;

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function hasBytes(bytes: Uint8Array, offset: number, count: number): boolean {
  return offset + count <= bytes.length;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    ((bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!)
  );
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function normalize(width: number, height: number): ImageDimensions | undefined {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  return { width, height };
}

function isPng(bytes: Uint8Array): boolean {
  return (
    hasBytes(bytes, 0, 8) &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return hasBytes(bytes, 0, 2) && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    hasBytes(bytes, 0, 12) &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function parsePng(bytes: Uint8Array): ImageDimensions | undefined {
  if (!hasBytes(bytes, 0, 24)) {
    return undefined;
  }

  return normalize(readUint32BE(bytes, 16), readUint32BE(bytes, 20));
}

function parseJpeg(bytes: Uint8Array): ImageDimensions | undefined {
  let offset = 2;

  while (hasBytes(bytes, offset, 4)) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1]!;

    if (marker === 0xff) {
      offset += 1;
      continue;
    }

    if (marker === 0x00) {
      offset += 2;
      continue;
    }

    offset += 2;

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const segmentLength = readUint16BE(bytes, offset);

    if (segmentLength < 2) {
      break;
    }

    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (!hasBytes(bytes, offset, 7)) {
        break;
      }

      return normalize(readUint16BE(bytes, offset + 5), readUint16BE(bytes, offset + 3));
    }

    offset += segmentLength;
  }

  return undefined;
}

function parseWebp(bytes: Uint8Array): ImageDimensions | undefined {
  if (!hasBytes(bytes, 0, 16)) {
    return undefined;
  }

  const fourCc = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);

  if (fourCc === 'VP8X') {
    if (!hasBytes(bytes, 0, 30)) {
      return undefined;
    }

    return normalize(readUint24LE(bytes, 24) + 1, readUint24LE(bytes, 27) + 1);
  }

  if (fourCc === 'VP8L') {
    if (!hasBytes(bytes, 0, 25) || bytes[20] !== 0x2f) {
      return undefined;
    }

    const bits = readUint32LE(bytes, 21);

    return normalize((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }

  if (fourCc === 'VP8 ') {
    if (
      !hasBytes(bytes, 0, 30) ||
      bytes[23] !== 0x9d ||
      bytes[24] !== 0x01 ||
      bytes[25] !== 0x2a
    ) {
      return undefined;
    }

    return normalize(readUint16LE(bytes, 26) & 0x3fff, readUint16LE(bytes, 28) & 0x3fff);
  }

  return undefined;
}

function parseByFormat(bytes: Uint8Array): ImageDimensions | undefined {
  if (isPng(bytes)) {
    return parsePng(bytes);
  }

  if (isJpeg(bytes)) {
    return parseJpeg(bytes);
  }

  if (isWebp(bytes)) {
    return parseWebp(bytes);
  }

  return undefined;
}

async function readBytes(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  const buffer = await blob.slice(start, end).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function readImageDimensions(
  blob: Blob,
): Promise<ImageDimensions | undefined> {
  if (typeof blob.slice !== 'function' || blob.size <= 0) {
    return undefined;
  }

  const initialEnd = Math.min(blob.size, INITIAL_PROBE_BYTES);
  let bytes = await readBytes(blob, 0, initialEnd);
  const parsed = parseByFormat(bytes);

  if (parsed || blob.size <= initialEnd || !isJpeg(bytes)) {
    return parsed;
  }

  const extendedEnd = Math.min(blob.size, MAX_PROBE_BYTES);

  if (extendedEnd <= initialEnd) {
    return parsed;
  }

  bytes = await readBytes(blob, 0, extendedEnd);

  return parseByFormat(bytes);
}
