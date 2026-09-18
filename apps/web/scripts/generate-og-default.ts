#!/usr/bin/env tsx
/**
 * Rasterize the default Open Graph card (JOV-1651).
 *
 * Production still served a 62-byte HTML comment at /og/default.png.
 * This writes a real 1200×630 PNG from the locked brand mark + wordmark.
 *
 * Run from the repo root:
 *   pnpm --filter @jovie/web exec tsx scripts/generate-og-default.ts
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, '../public');
const OUTPUT = resolve(PUBLIC, 'og/default.png');
const MARK = resolve(PUBLIC, 'brand/Jovie-Logo-Mark-Cream.svg');
const WORDMARK = resolve(PUBLIC, 'brand/Jovie-Wordmark-Cream.svg');

const WIDTH = 1200;
const HEIGHT = 630;
const BACKGROUND = '#08090a';
const MARK_SIZE = 180;
const WORDMARK_WIDTH = 360;

export async function generateDefaultOgImage(
  outputPath = OUTPUT
): Promise<Buffer> {
  const [markSvg, wordmarkSvg] = await Promise.all([
    readFile(MARK),
    readFile(WORDMARK),
  ]);

  const markPng = await sharp(markSvg)
    .resize(MARK_SIZE, MARK_SIZE)
    .png()
    .toBuffer();
  const wordmarkPng = await sharp(wordmarkSvg)
    .resize(WORDMARK_WIDTH)
    .png()
    .toBuffer();

  const wordmarkMeta = await sharp(wordmarkPng).metadata();
  const wordmarkHeight = wordmarkMeta.height ?? 96;
  const markLeft = Math.round((WIDTH - MARK_SIZE) / 2);
  const wordmarkLeft = Math.round((WIDTH - WORDMARK_WIDTH) / 2);
  const markTop = 168;
  const wordmarkTop = markTop + MARK_SIZE + 36;

  const png = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite([
      { input: markPng, left: markLeft, top: markTop },
      { input: wordmarkPng, left: wordmarkLeft, top: wordmarkTop },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (wordmarkHeight < 8) {
    throw new Error('OG wordmark rasterized with no height');
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, png);
  return png;
}

function isDirectRun(): boolean {
  return process.argv[1]
    ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;
}

if (isDirectRun()) {
  generateDefaultOgImage()
    .then(png => {
      console.log(`Wrote ${OUTPUT} (${png.byteLength} bytes)`);
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
