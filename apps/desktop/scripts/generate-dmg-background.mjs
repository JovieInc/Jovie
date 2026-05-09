#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');
const ASSETS_DIR = path.join(REPO_ROOT, 'apps/desktop/assets');
const OUTPUT_PATH = path.join(ASSETS_DIR, 'dmg-background.png');

const WIDTH = 660;
const HEIGHT = 400;

const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" rx="0" fill="#0B0D10"/>
  <rect x="0" y="0" width="${WIDTH}" height="132" fill="#11151B"/>
  <path d="M0 132H660" stroke="#252A33" stroke-width="1"/>
  <text x="330" y="63" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="28" font-weight="700" letter-spacing="0" fill="#F7F8FA">Jovie</text>
  <text x="330" y="94" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="14" font-weight="500" letter-spacing="0" fill="#A7B0BE">Drag Jovie to Applications</text>
  <path d="M268 218H392" stroke="#5D96D5" stroke-width="3" stroke-linecap="round"/>
  <path d="M382 205L397 218L382 231" fill="none" stroke="#5D96D5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="180" y="323" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="12" font-weight="500" letter-spacing="0" fill="#838C9A">Jovie</text>
  <text x="480" y="323" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="12" font-weight="500" letter-spacing="0" fill="#838C9A">Applications</text>
</svg>`;

await mkdir(ASSETS_DIR, { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(OUTPUT_PATH);

console.log(`DMG background written: ${OUTPUT_PATH}`);
