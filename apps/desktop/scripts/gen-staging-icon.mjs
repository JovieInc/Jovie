#!/usr/bin/env node
/**
 * Generates the staging variant of the Jovie desktop icon.
 *
 * Reads the canonical Jovie-logo.png from apps/web/public/,
 * composites an orange "S" badge in the bottom-right corner,
 * and writes the result to apps/desktop/assets/icon-staging.png.
 *
 * Also ensures the base production icon.png is up to date.
 *
 * Usage: node apps/desktop/scripts/gen-staging-icon.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');

const SOURCE_LOGO = path.join(REPO_ROOT, 'apps/web/public/Jovie-logo.png');
const ASSETS_DIR = path.join(REPO_ROOT, 'apps/desktop/assets');
const ICON_PATH = path.join(ASSETS_DIR, 'icon.png');
const OUTPUT_PATH = path.join(ASSETS_DIR, 'icon-staging.png');

const ICON_SIZE = 512;
const BADGE_SIZE = 96;

const BADGE_SVG = `<svg width="${BADGE_SIZE}" height="${BADGE_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${BADGE_SIZE / 2}" cy="${BADGE_SIZE / 2}" r="${BADGE_SIZE / 2}" fill="#F97316"/>
  <text
    x="${BADGE_SIZE / 2}"
    y="${BADGE_SIZE / 2 + 20}"
    font-size="56"
    font-family="sans-serif"
    font-weight="700"
    text-anchor="middle"
    fill="white"
  >S</text>
</svg>`;

// Ensure the base icon is present and correctly sized
await sharp(SOURCE_LOGO)
  .resize(ICON_SIZE, ICON_SIZE, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .ensureAlpha()
  .png()
  .toFile(ICON_PATH);

console.log(`Base icon written: ${ICON_PATH}`);

// Composite the staging badge
const badgeBuffer = await sharp(Buffer.from(BADGE_SVG))
  .resize(BADGE_SIZE, BADGE_SIZE)
  .png()
  .toBuffer();

const BADGE_OFFSET = ICON_SIZE - BADGE_SIZE;

await sharp(ICON_PATH)
  .composite([{ input: badgeBuffer, top: BADGE_OFFSET, left: BADGE_OFFSET }])
  .png()
  .toFile(OUTPUT_PATH);

console.log(`Staging icon written to: ${OUTPUT_PATH}`);
