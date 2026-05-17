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
const JOVIE_MARK_VIEWBOX_WIDTH = 353.68;
export const JOVIE_MARK_PATH =
  'm176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z';

export function getDesktopBuildYear(now = new Date()) {
  const year = now.getFullYear();
  return Number.isFinite(year) ? Math.max(year, YEAR_MIN) : YEAR_MIN;
}

function renderJovieMark({ x, y, size, fill, opacity = 1 }) {
  const scale = size / JOVIE_MARK_VIEWBOX_WIDTH;
  const opacityAttribute = opacity === 1 ? '' : ` opacity="${opacity}"`;

  return `<g transform="translate(${x} ${y}) scale(${scale})"${opacityAttribute}>
    <path d="${JOVIE_MARK_PATH}" fill="${fill}"/>
  </g>`;
}

export function buildDmgBackgroundSvg({ year = getDesktopBuildYear() } = {}) {
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
  ${renderJovieMark({ x: 474, y: 86, size: 228, fill: '#F7F8FA', opacity: 0.055 })}
  <text x="380" y="86" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="24" font-weight="700" letter-spacing="0" fill="#F5F7FA">Install Jovie</text>
  <text x="380" y="112" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="13" font-weight="500" letter-spacing="0" fill="#9AA4B2">Drag Jovie to Applications</text>
  <rect x="${APP_ZONE_X}" y="${ZONE_Y}" width="${DROP_ZONE_SIZE}" height="${DROP_ZONE_SIZE}" rx="30" fill="#141922" fill-opacity="0.82" stroke="#2E3743" filter="url(#soft-shadow)"/>
  <rect x="${APP_ZONE_X + 7}" y="${ZONE_Y + 7}" width="${DROP_ZONE_SIZE - 14}" height="${DROP_ZONE_SIZE - 14}" rx="24" fill="none" stroke="#FFFFFF" stroke-opacity="0.08"/>
  <rect x="${TARGET_ZONE_X}" y="${ZONE_Y}" width="${DROP_ZONE_SIZE}" height="${DROP_ZONE_SIZE}" rx="30" fill="#0D1117" fill-opacity="0.54" stroke="#505865" stroke-width="2" stroke-dasharray="10 8"/>
  <path d="M338 226L356 244L338 262" fill="none" stroke="#596270" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.42"/>
  <path d="M373 226L391 244L373 262" fill="none" stroke="#717A87" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.58"/>
  <path d="M408 226L426 244L408 262" fill="none" stroke="#BFC7D2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.88"/>
  <rect x="0" y="396" width="${WIDTH}" height="84" fill="#0E1116" stroke="#242A33"/>
  ${renderJovieMark({ x: 50, y: 424, size: 44, fill: '#F5F7FA' })}
  <text x="104" y="436" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="15" font-weight="650" letter-spacing="0" fill="#F2F5F8">Jovie Technology Inc.</text>
  <text x="104" y="460" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="13" font-weight="500" letter-spacing="0" fill="#9CA6B4">&#169; ${year}</text>
  <text x="708" y="446" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="18" font-weight="700" letter-spacing="0" fill="#F2F5F8">Built for artists</text>
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
