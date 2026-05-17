#!/usr/bin/env node

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const ASSETS_DIR = path.join(REPO_ROOT, 'apps/desktop/assets');
const OUTPUT_PATH = path.join(ASSETS_DIR, 'dmg-background.png');
const ICON_PATH = path.join(ASSETS_DIR, 'icon.png');

export const WIDTH = 760;
export const HEIGHT = 480;

const YEAR_MIN = 2026;
const APP_CENTER = { x: 242, y: 244 };
const APPLICATIONS_CENTER = { x: 518, y: 244 };
const DROP_ZONE_SIZE = 128;
const APP_ZONE_X = APP_CENTER.x - DROP_ZONE_SIZE / 2;
const TARGET_ZONE_X = APPLICATIONS_CENTER.x - DROP_ZONE_SIZE / 2;
const ZONE_Y = APP_CENTER.y - DROP_ZONE_SIZE / 2;
const DEFAULT_JOVIE_ICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(
  `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" rx="116" fill="#050506"/>
    <path fill="#F5F5F2" d="M256 52c112.7 0 204 91.3 204 204s-91.3 204-204 204S52 368.7 52 256 143.3 52 256 52Zm0 116a88 88 0 1 0 0 176 88 88 0 0 0 0-176Z" fill-rule="evenodd"/>
  </svg>`
)}`;

export function getDesktopBuildYear(now = new Date()) {
  const year = now.getFullYear();
  return Number.isFinite(year) ? Math.max(year, YEAR_MIN) : YEAR_MIN;
}

async function pngDataUri(filePath) {
  const buffer = await readFile(filePath);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

export function buildDmgBackgroundSvg({
  year = getDesktopBuildYear(),
  appIconDataUri = DEFAULT_JOVIE_ICON_DATA_URI,
} = {}) {
  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="jovie-grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0H0V24" fill="none" stroke="#1A1F27" stroke-width="1"/>
      <path d="M12 7V17M7 12H17" stroke="#2B323D" stroke-width="1" stroke-linecap="round" opacity="0.52"/>
    </pattern>
    <linearGradient id="stage-glow" x1="68" y1="60" x2="692" y2="374" gradientUnits="userSpaceOnUse">
      <stop stop-color="#11131A"/>
      <stop offset="0.52" stop-color="#0B0D12"/>
      <stop offset="1" stop-color="#12101B"/>
    </linearGradient>
    <radialGradient id="accent-left" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(204 184) rotate(52) scale(148 112)">
      <stop stop-color="#715CFF" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#715CFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="accent-right" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(558 180) rotate(116) scale(156 112)">
      <stop stop-color="#D76DFF" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#D76DFF" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity="0.34"/>
    </filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#080A0D"/>
  <rect x="32" y="30" width="696" height="366" rx="22" fill="url(#stage-glow)" stroke="#242A33"/>
  <rect x="32" y="30" width="696" height="366" rx="22" fill="url(#jovie-grid)" opacity="0.66"/>
  <rect x="32" y="30" width="696" height="366" rx="22" fill="url(#accent-left)"/>
  <rect x="32" y="30" width="696" height="366" rx="22" fill="url(#accent-right)"/>
  <rect x="68" y="66" width="624" height="294" rx="18" fill="#090B0F" opacity="0.42"/>
  <image href="${appIconDataUri}" x="480" y="80" width="208" height="208" opacity="0.13" preserveAspectRatio="xMidYMid meet"/>
  <text x="380" y="86" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="24" font-weight="700" letter-spacing="0" fill="#F5F7FA">Install Jovie</text>
  <text x="380" y="112" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="13" font-weight="500" letter-spacing="0" fill="#9AA4B2">Drag Jovie to Applications</text>
  <rect x="${APP_ZONE_X}" y="${ZONE_Y}" width="${DROP_ZONE_SIZE}" height="${DROP_ZONE_SIZE}" rx="30" fill="#141922" fill-opacity="0.82" stroke="#2E3743" filter="url(#soft-shadow)"/>
  <rect x="${APP_ZONE_X + 7}" y="${ZONE_Y + 7}" width="${DROP_ZONE_SIZE - 14}" height="${DROP_ZONE_SIZE - 14}" rx="24" fill="none" stroke="#FFFFFF" stroke-opacity="0.08"/>
  <rect x="${TARGET_ZONE_X}" y="${ZONE_Y}" width="${DROP_ZONE_SIZE}" height="${DROP_ZONE_SIZE}" rx="30" fill="#0D1117" fill-opacity="0.54" stroke="#505865" stroke-width="2" stroke-dasharray="10 8"/>
  <path d="M338 226L356 244L338 262" fill="none" stroke="#596270" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.42"/>
  <path d="M373 226L391 244L373 262" fill="none" stroke="#717A87" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.58"/>
  <path d="M408 226L426 244L408 262" fill="none" stroke="#BFC7D2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.88"/>
  <rect x="0" y="396" width="${WIDTH}" height="84" fill="#0E1116" stroke="#242A33"/>
  <image href="${appIconDataUri}" x="50" y="418" width="50" height="50" preserveAspectRatio="xMidYMid meet"/>
  <text x="114" y="436" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="15" font-weight="650" letter-spacing="0" fill="#F2F5F8">Jovie Technology Inc.</text>
  <text x="114" y="460" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="13" font-weight="500" letter-spacing="0" fill="#9CA6B4">&#169; ${year}</text>
  <text x="708" y="446" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="18" font-weight="700" letter-spacing="0" fill="#F2F5F8">Built for artists</text>
</svg>`;
}

export async function generateDmgBackground({
  outputPath = OUTPUT_PATH,
  year = getDesktopBuildYear(),
  appIconPath = ICON_PATH,
} = {}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const appIconDataUri = await pngDataUri(appIconPath);
  await sharp(Buffer.from(buildDmgBackgroundSvg({ year, appIconDataUri })))
    .png()
    .toFile(outputPath);
  return outputPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputPath = await generateDmgBackground();
  console.log(`DMG background written: ${outputPath}`);
}
