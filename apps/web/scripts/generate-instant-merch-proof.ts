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
import { join } from 'node:path';
import sharp from 'sharp';
import { buildPrintSvg, renderMockup } from '@/lib/merch/artwork';
import type { MerchDesignLane } from '@/lib/merch/types';

const OUT_DIR = join(process.cwd(), 'public', 'images', 'merch');

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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
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

    const printPath = join(OUT_DIR, `${item.slug}-print.webp`);
    const mockupPath = join(OUT_DIR, `${item.slug}-mockup.webp`);
    writeFileSync(printPath, printProof);
    writeFileSync(mockupPath, mockupProof);
    console.log(`wrote ${printPath}`);
    console.log(`wrote ${mockupPath}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
