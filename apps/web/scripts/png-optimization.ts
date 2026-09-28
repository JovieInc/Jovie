import { readFile, writeFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { validPlaywrightPng } from '../../../scripts/lib/playwright-png.mjs';

export interface PngOptimizationResult {
  readonly afterBytes: number;
  readonly beforeBytes: number;
  readonly rewritten: boolean;
}

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const RETAINED_CHUNKS = new Set(['IHDR', 'IDAT', 'IEND']);
const STRIPPED_ANCILLARY_CHUNKS = new Set(['pHYs']);

/**
 * Remove ancillary PNG metadata without touching compressed pixels.
 *
 * The safe screenshot transport deliberately accepts only the minimal
 * Playwright PNG structure. Sharp adds a pHYs chunk while recompressing, so
 * validate every chunk and retain only the critical image stream.
 */
export function stripPngAncillaryChunks(source: Buffer): Buffer {
  if (!source.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('PNG optimization output has an invalid signature');
  }

  const retained = [source.subarray(0, 8)];
  let offset = 8;
  while (offset < source.length) {
    if (offset + 12 > source.length) {
      throw new Error('PNG optimization output has a truncated chunk');
    }
    const length = source.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > source.length) {
      throw new Error('PNG optimization output has an invalid chunk length');
    }
    const type = source.toString('ascii', offset + 4, offset + 8);
    const chunk = source.subarray(offset, end);
    if (
      crc32(chunk.subarray(4, chunk.length - 4)) !==
      chunk.readUInt32BE(chunk.length - 4)
    ) {
      throw new Error(`PNG optimization output has an invalid ${type} CRC`);
    }
    if (RETAINED_CHUNKS.has(type)) {
      retained.push(chunk);
    } else if (!STRIPPED_ANCILLARY_CHUNKS.has(type)) {
      throw new Error(`PNG optimization output has unsupported chunk ${type}`);
    }
    offset = end;
  }

  const strict = Buffer.concat(retained);
  if (!validPlaywrightPng(strict)) {
    throw new Error('PNG optimization output is not a strict Playwright PNG');
  }
  return strict;
}

/**
 * Recompress a screenshot without palette quantization or pixel changes.
 *
 * Playwright's PNG encoder favors capture speed. The catalog is durable source
 * evidence, so its writer pays the extra compression cost once and retains the
 * smaller representation only when it is an actual improvement.
 */
export async function optimizePngLosslessly(
  path: string
): Promise<PngOptimizationResult> {
  const source = await readFile(path);
  const optimized = stripPngAncillaryChunks(
    await sharp(source)
      .png({
        adaptiveFiltering: true,
        compressionLevel: 9,
        effort: 10,
        palette: false,
      })
      .toBuffer()
  );

  if (validPlaywrightPng(source) && optimized.length >= source.length) {
    return {
      afterBytes: source.length,
      beforeBytes: source.length,
      rewritten: false,
    };
  }

  await writeFile(path, optimized);
  return {
    afterBytes: optimized.length,
    beforeBytes: source.length,
    rewritten: true,
  };
}
