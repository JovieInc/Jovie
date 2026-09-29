/**
 * Instant Merch marketing-proof generator (JOV-7154).
 *
 * Renders the dogfood concepts shown on /instant-merch through the canonical
 * merch pipeline — `buildPrintSvg` (deterministic print artwork) and
 * `renderMockup` (garment compositing) from lib/merch/artwork — and commits
 * the outputs under public/images/merch/. The marketing page must show the
 * same garment mockups the product produces, never album-art placeholders
 * or marketing-only renders.
 *
 * Run:
 *   pnpm --filter web exec tsx \
 *     --import ./tests/eval/promptfoo/server-only-preload.mjs \
 *     scripts/generate-instant-merch-proof.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildPrintSvg, renderMockup } from '@/lib/merch/artwork';
import type { MerchDesignLane } from '@/lib/merch/types';

const DEFAULT_OUT_DIR = join(process.cwd(), 'public', 'images', 'merch');

interface ProofConcept {
  readonly slug: string;
  readonly designName: string;
  readonly lane: MerchDesignLane;
  readonly concept: string;
  readonly productType: string;
}

const CONCEPTS: readonly ProofConcept[] = [
  {
    slug: 'never-say-a-word-tee',
    designName: 'Never Say A Word',
    lane: 'band_tour_uniform',
    concept: 'Single lyric line over the release artwork palette.',
    productType: 'premium tee',
  },
  {
    slug: 'the-deep-end-hoodie',
    designName: 'The Deep End',
    lane: 'artist_world_artifact',
    concept: 'Cover-art world on a heavyweight hoodie.',
    productType: 'premium hoodie',
  },
  {
    slug: 'take-me-over-cap',
    designName: 'Take Me Over',
    lane: 'fashion_graphic_item',
    concept: 'Minimal wordmark treatment on a limited cap.',
    productType: 'structured cap',
  },
];

export async function generateInstantMerchProofs(
  outDir = DEFAULT_OUT_DIR
): Promise<readonly string[]> {
  mkdirSync(outDir, { recursive: true });
  const outputPaths: string[] = [];

  for (const item of CONCEPTS) {
    const printFile = await sharp(
      buildPrintSvg({
        artistName: 'Tim White',
        designName: item.designName,
        lane: item.lane,
        concept: item.concept,
      })
    )
      .png()
      .toBuffer();

    const mockup = await renderMockup(printFile, item.productType);

    const printProof = await sharp(printFile)
      .resize({ width: 1200 })
      .webp({ quality: 92 })
      .toBuffer();
    const mockupProof = await sharp(mockup)
      .resize({ width: 1200 })
      .webp({ quality: 88 })
      .toBuffer();

    const printPath = join(outDir, `${item.slug}-print.webp`);
    const mockupPath = join(outDir, `${item.slug}-mockup.webp`);
    writeFileSync(printPath, printProof);
    writeFileSync(mockupPath, mockupProof);
    outputPaths.push(printPath, mockupPath);
    console.log(`wrote ${printPath}`);
    console.log(`wrote ${mockupPath}`);
  }

  return outputPaths;
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  generateInstantMerchProofs().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
