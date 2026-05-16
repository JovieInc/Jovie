#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const ASSETS_DIR = path.join(REPO_ROOT, 'apps/desktop/assets');
const OUTPUT_PATH = path.join(ASSETS_DIR, 'dmg-background.png');

export const WIDTH = 760;
export const HEIGHT = 480;

const YEAR_MIN = 2026;
const APP_CENTER = { x: 242, y: 244 };
const APPLICATIONS_CENTER = { x: 518, y: 244 };
const DROP_ZONE_SIZE = 128;
const APP_ZONE_X = APP_CENTER.x - DROP_ZONE_SIZE / 2;
const TARGET_ZONE_X = APPLICATIONS_CENTER.x - DROP_ZONE_SIZE / 2;
const ZONE_Y = APP_CENTER.y - DROP_ZONE_SIZE / 2;

export function getDesktopBuildYear(now = new Date()) {
  const year = now.getFullYear();
  return Number.isFinite(year) ? Math.max(year, YEAR_MIN) : YEAR_MIN;
}

export function buildDmgBackgroundSvg({ year = getDesktopBuildYear() } = {}) {
  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="jovie-grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M24 0H0V24" fill="none" stroke="#1A1F27" stroke-width="1"/>
      <path d="M12 7V17M7 12H17" stroke="#2B323D" stroke-width="1" stroke-linecap="round" opacity="0.52"/>
    </pattern>
    <linearGradient id="stage-glow" x1="68" y1="60" x2="692" y2="374" gradientUnits="userSpaceOnUse">
      <stop stop-color="#11211C"/>
      <stop offset="0.5" stop-color="#0C1015"/>
      <stop offset="1" stop-color="#101825"/>
    </linearGradient>
    <radialGradient id="accent-left" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(204 184) rotate(52) scale(148 112)">
      <stop stop-color="#4ED7A8" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#4ED7A8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="accent-right" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(558 180) rotate(116) scale(156 112)">
      <stop stop-color="#63A3FF" stop-opacity="0.26"/>
      <stop offset="1" stop-color="#63A3FF" stop-opacity="0"/>
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
  <text x="380" y="86" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="24" font-weight="700" letter-spacing="0" fill="#F5F7FA">Install Jovie</text>
  <text x="380" y="112" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="13" font-weight="500" letter-spacing="0" fill="#9AA4B2">Drag Jovie to Applications</text>
  <rect x="${APP_ZONE_X}" y="${ZONE_Y}" width="${DROP_ZONE_SIZE}" height="${DROP_ZONE_SIZE}" rx="30" fill="#141922" fill-opacity="0.82" stroke="#2E3743" filter="url(#soft-shadow)"/>
  <rect x="${APP_ZONE_X + 7}" y="${ZONE_Y + 7}" width="${DROP_ZONE_SIZE - 14}" height="${DROP_ZONE_SIZE - 14}" rx="24" fill="none" stroke="#FFFFFF" stroke-opacity="0.08"/>
  <rect x="${TARGET_ZONE_X}" y="${ZONE_Y}" width="${DROP_ZONE_SIZE}" height="${DROP_ZONE_SIZE}" rx="30" fill="#0D1117" fill-opacity="0.54" stroke="#505865" stroke-width="2" stroke-dasharray="10 8"/>
  <path d="M338 226L356 244L338 262" fill="none" stroke="#596270" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.42"/>
  <path d="M373 226L391 244L373 262" fill="none" stroke="#717A87" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.58"/>
  <path d="M408 226L426 244L408 262" fill="none" stroke="#BFC7D2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.88"/>
  <rect x="0" y="396" width="${WIDTH}" height="84" fill="#0E1116" stroke="#242A33"/>
  <g transform="translate(50 424)">
    <circle cx="22" cy="22" r="22" fill="#F5F7FA"/>
    <path d="M31 10A20 20 0 0 0 11 30H31V10Z" fill="#101217"/>
    <path d="M11 31L30 31M14 36L31 36M18 41L32 41" stroke="#101217" stroke-width="3.8" stroke-linecap="round"/>
  </g>
  <text x="104" y="435" font-family="'SF Mono', ui-monospace, Menlo, Consolas, monospace" font-size="15" font-weight="700" letter-spacing="0" fill="#E9EDF2">JOVIE SYSTEM</text>
  <text x="104" y="459" font-family="'SF Mono', ui-monospace, Menlo, Consolas, monospace" font-size="14" font-weight="500" letter-spacing="0" fill="#A8B0BB">DESKTOP WORKSPACE</text>
  <text x="708" y="435" text-anchor="end" font-family="'SF Mono', ui-monospace, Menlo, Consolas, monospace" font-size="15" font-weight="700" letter-spacing="0" fill="#E9EDF2">COPYRIGHT &#169; ${year}</text>
  <text x="708" y="459" text-anchor="end" font-family="'SF Mono', ui-monospace, Menlo, Consolas, monospace" font-size="14" font-weight="500" letter-spacing="0" fill="#A8B0BB">DESIGNED FOR ARTISTS</text>
</svg>`;
}

export async function generateDmgBackground({
  outputPath = OUTPUT_PATH,
  year = getDesktopBuildYear(),
} = {}) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(buildDmgBackgroundSvg({ year }))).png().toFile(outputPath);
  return outputPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputPath = await generateDmgBackground();
  console.log(`DMG background written: ${outputPath}`);
}
