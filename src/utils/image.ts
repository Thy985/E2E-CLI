/**
 * Shared PNG encoding/decoding utilities for visual diff and screenshot comparison.
 * Provides minimal PNG I/O for pixelmatch-based image comparison.
 */

import * as fs from 'fs';

// ==================== Types ====================

export interface PNGData {
  data: Uint8Array;
  width: number;
  height: number;
}

export type PixelmatchFn = (
  img1: Uint8Array | Uint8ClampedArray,
  img2: Uint8Array | Uint8ClampedArray,
  output: Uint8Array | Uint8ClampedArray | null,
  width: number,
  height: number,
  options?: { threshold?: number }
) => number;

// ==================== CRC32 ====================

let _crc32Table: number[] | null = null;

export function getCrc32Table(): number[] {
  if (!_crc32Table) {
    _crc32Table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      _crc32Table[n] = c;
    }
  }
  return _crc32Table;
}

export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  const table = getCrc32Table();
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ==================== Paeth Predictor ====================

export function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// ==================== PNG Filter Reconstruction ====================

export function applyFilter(
  output: Buffer,
  raw: Buffer,
  rowStart: number,
  _stride: number,
  y: number,
  width: number,
  filter: number
): void {
  const outRowStart = y * width * 4;
  const bytesPerPixel = 4;

  for (let x = 0; x < width; x++) {
    const srcPos = rowStart + 1 + x * bytesPerPixel;
    const dstPos = outRowStart + x * bytesPerPixel;

    for (let b = 0; b < bytesPerPixel; b++) {
      const rawByte = raw[srcPos + b];
      let priorByte = 0;
      let leftByte = 0;
      let priorLeftByte = 0;

      if (y > 0) {
        const prevOutRowStart = (y - 1) * width * 4;
        priorByte = output[prevOutRowStart + x * bytesPerPixel + b];
        if (x > 0) {
          priorLeftByte = output[prevOutRowStart + (x - 1) * bytesPerPixel + b];
        }
      }
      if (x > 0) {
        leftByte = output[outRowStart + (x - 1) * bytesPerPixel + b];
      }

      let result = rawByte;
      switch (filter) {
        case 1: // Sub
          result = (rawByte + leftByte) & 0xff;
          break;
        case 2: // Up
          result = (rawByte + priorByte) & 0xff;
          break;
        case 3: // Average
          result = (rawByte + Math.floor((leftByte + priorByte) / 2)) & 0xff;
          break;
        case 4: // Paeth
          result = (rawByte + paethPredictor(leftByte, priorByte, priorLeftByte)) & 0xff;
          break;
      }
      output[dstPos + b] = result;
    }
  }
}

// ==================== PNG Decoder ====================

export async function readPNG(filePath: string): Promise<PNGData | null> {
  try {
    const buffer = await fs.promises.readFile(filePath);
    // PNG signature check
    if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
      return null;
    }

    let width = 0;
    let height = 0;
    let bitDepth = 8;
    let colorType = 6; // default RGBA
    const idatChunks: Buffer[] = [];
    let offset = 8; // skip PNG signature

    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');

      if (type === 'IHDR') {
        width = buffer.readUInt32BE(offset + 8);
        height = buffer.readUInt32BE(offset + 12);
        bitDepth = buffer[offset + 16];
        colorType = buffer[offset + 17];
      } else if (type === 'IDAT') {
        idatChunks.push(buffer.subarray(offset + 8, offset + 8 + length));
      } else if (type === 'IEND') {
        break;
      }

      offset += 12 + length; // length(4) + type(4) + data(length) + crc(4)
    }

    if (width === 0 || height === 0 || idatChunks.length === 0) {
      return null;
    }

    // Decompress IDAT data
    const compressed = Buffer.concat(idatChunks);
    const { inflateRaw } = await import('zlib');
    const decompressed = await new Promise<Buffer>((resolve, reject) => {
      inflateRaw(compressed, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    // Convert PNG raw data (with filter bytes) to RGBA
    const channelsPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
    const bytesPerPixel = channelsPerPixel * (bitDepth >= 8 ? bitDepth / 8 : 1);
    const stride = width * bytesPerPixel + 1; // +1 for filter byte
    const output = Buffer.alloc(width * height * 4);

    for (let y = 0; y < height; y++) {
      const rowStart = y * stride;
      const filterByte = decompressed[rowStart];
      const outRowStart = y * width * 4;

      for (let x = 0; x < width; x++) {
        const srcPos = rowStart + 1 + x * bytesPerPixel;
        const dstPos = outRowStart + x * 4;

        if (colorType === 6) {
          // RGBA
          output[dstPos] = decompressed[srcPos];
          output[dstPos + 1] = decompressed[srcPos + 1];
          output[dstPos + 2] = decompressed[srcPos + 2];
          output[dstPos + 3] = decompressed[srcPos + 3];
        } else if (colorType === 2) {
          // RGB → RGBA
          output[dstPos] = decompressed[srcPos];
          output[dstPos + 1] = decompressed[srcPos + 1];
          output[dstPos + 2] = decompressed[srcPos + 2];
          output[dstPos + 3] = 255;
        } else if (colorType === 0) {
          // Grayscale → RGBA
          const v = decompressed[srcPos];
          output[dstPos] = v;
          output[dstPos + 1] = v;
          output[dstPos + 2] = v;
          output[dstPos + 3] = 255;
        } else {
          // Unsupported color type → treat as opaque black
          output[dstPos] = 0;
          output[dstPos + 1] = 0;
          output[dstPos + 2] = 0;
          output[dstPos + 3] = 255;
        }
      }

      // Apply filter (simplified: only None filter = 0 is fully supported)
      // For other filters, we attempt basic reconstruction
      if (filterByte !== 0) {
        applyFilter(output, decompressed, rowStart, stride, y, width, filterByte);
      }
    }

    return { data: new Uint8Array(output), width, height };
  } catch {
    return null;
  }
}

// ==================== PNG Encoder ====================

export async function writePNG(
  filePath: string,
  rgbaData: Buffer,
  width: number,
  height: number
): Promise<void> {
  const { deflate } = await import('zlib');
  const chunks: Buffer[] = [];

  function makeChunk(type: string, data: Buffer): Buffer {
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuf, data]);

    const crc = crc32(crcData);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0, 0);

    return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
  }

  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type (RGBA)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  // IDAT: raw PNG scanlines (filter byte 0 per row)
  const rawLines: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    const line = Buffer.alloc(width * 4 + 1);
    line[0] = 0; // filter: None
    rgbaData.copy(line, 1, rowStart, rowStart + width * 4);
    rawLines.push(line);
  }
  const rawData = Buffer.concat(rawLines);

  const compressed = await new Promise<Buffer>((resolve, reject) => {
    deflate(rawData, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  // IEND
  const iendData = Buffer.alloc(0);

  chunks.push(signature);
  chunks.push(makeChunk('IHDR', ihdrData));
  chunks.push(makeChunk('IDAT', compressed));
  chunks.push(makeChunk('IEND', iendData));

  await fs.promises.writeFile(filePath, Buffer.concat(chunks));
}

// ==================== Pixelmatch Loader ====================

let _pixelmatch: PixelmatchFn | null = null;

export async function loadPixelmatch(): Promise<PixelmatchFn | null> {
  if (_pixelmatch) return _pixelmatch;
  try {
    const mod = await import('pixelmatch') as { default: PixelmatchFn };
    _pixelmatch = mod.default;
    return _pixelmatch;
  } catch {
    return null;
  }
}
