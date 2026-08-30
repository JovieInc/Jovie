import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

export interface PngOptimizationResult {
  readonly afterBytes: number;
  readonly beforeBytes: number;
  readonly rewritten: boolean;
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
  const optimized = await sharp(source)
    .png({
      adaptiveFiltering: true,
      compressionLevel: 9,
      effort: 10,
      palette: false,
    })
    .toBuffer();

  if (optimized.length >= source.length) {
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
