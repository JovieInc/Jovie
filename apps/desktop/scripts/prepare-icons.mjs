#!/usr/bin/env node
/**
 * Prepares all desktop app icons from the canonical desktop icon source.
 *
 * - Copies and resizes apps/desktop/assets/icon-source.png to
 *   apps/desktop/assets/icon.png (512×512)
 * - Generates the staging variant with an orange "S" badge at the
 *   bottom-right corner → apps/desktop/assets/icon-staging.png
 *
 * Usage: node apps/desktop/scripts/prepare-icons.mjs
 *
 * NOTE: CI (desktop-release.yml) calls gen-staging-icon.mjs, NOT this script.
 * Run this manually when you need to regenerate both icons at once locally.
 *
 * NOTE: .icns and .ico are NOT committed. electron-builder generates them
 * at build time from the .png files.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');

const ASSETS_DIR = path.join(REPO_ROOT, 'apps/desktop/assets');
const SOURCE_ICON = path.join(ASSETS_DIR, 'icon-source.png');
const ICON_PATH = path.join(ASSETS_DIR, 'icon.png');
const STAGING_ICON_PATH = path.join(ASSETS_DIR, 'icon-staging.png');

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

// 1. Production icon — resize source icon to 512×512
await sharp(SOURCE_ICON)
  .resize(ICON_SIZE, ICON_SIZE, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .ensureAlpha()
  .png()
  .toFile(ICON_PATH);

console.log(`Production icon written: ${ICON_PATH}`);

// 2. Staging icon — add orange "S" badge in bottom-right
const baseBuffer = await sharp(ICON_PATH).toBuffer();

const badgeBuffer = await sharp(Buffer.from(BADGE_SVG))
  .resize(BADGE_SIZE, BADGE_SIZE)
  .png()
  .toBuffer();

const BADGE_OFFSET = ICON_SIZE - BADGE_SIZE;

await sharp(baseBuffer)
  .composite([{ input: badgeBuffer, top: BADGE_OFFSET, left: BADGE_OFFSET }])
  .png()
  .toFile(STAGING_ICON_PATH);

console.log(`Staging icon written:    ${STAGING_ICON_PATH}`);
