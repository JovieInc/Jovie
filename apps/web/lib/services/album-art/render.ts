import 'server-only';

import sharp from 'sharp';
import type { AlbumArtStylePreset } from './types';

const COVER_SIZE = 3000;
const PREVIEW_SIZE = 1000;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function splitWords(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function wrapText(value: string, maxLines: number): string[] {
  const words = splitWords(value);
  if (words.length === 0) return [''];
  const target = Math.ceil(value.length / maxLines);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > target && current && lines.length < maxLines - 1) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

function resolveFontSize(
  lines: readonly string[],
  min: number,
  max: number
): number {
  const longest = Math.max(...lines.map(line => line.length), 1);
  const scaled = Math.floor(1700 / Math.max(longest, 8));
  return Math.max(min, Math.min(max, scaled));
}

function layoutFor(style: AlbumArtStylePreset): {
  readonly titleY: number;
  readonly artistY: number;
  readonly anchor: 'middle' | 'start';
  readonly x: number;
  readonly width: number;
  readonly plate: string;
} {
  if (style.overlayTheme.layout === 'center_stack') {
    return {
      titleY: 1450,
      artistY: 1770,
      anchor: 'middle',
      x: 1500,
      width: 3000,
      plate:
        '<rect x="300" y="1120" width="2400" height="820" rx="42" fill="url(#plate)" />',
    };
  }

  if (style.overlayTheme.layout === 'quiet_corner') {
    return {
      titleY: 2220,
      artistY: 2540,
      anchor: 'start',
      x: 240,
      width: 2360,
      plate:
        '<rect x="150" y="1960" width="2700" height="760" rx="38" fill="url(#plate)" />',
    };
  }

  return {
    titleY: 2180,
    artistY: 2530,
    anchor: 'middle',
    x: 1500,
    width: 3000,
    plate:
      '<rect x="0" y="1880" width="3000" height="1120" fill="url(#plate)" />',
  };
}

function buildOverlaySvg(params: {
  readonly releaseTitle: string;
  readonly artistName: string;
  readonly style: AlbumArtStylePreset;
}): Buffer {
  const titleLines = wrapText(params.releaseTitle, 3);
  const artistLines = wrapText(params.artistName, 1);
  const titleSize = resolveFontSize(
    titleLines,
    params.style.overlayTheme.titleMinSize,
    params.style.overlayTheme.titleMaxSize
  );
  const artistSize = resolveFontSize(
    artistLines,
    params.style.overlayTheme.artistMinSize,
    params.style.overlayTheme.artistMaxSize
  );
  const layout = layoutFor(params.style);
  const titleLineHeight = Math.floor(titleSize * 1.05);
  const titleStartY =
    layout.titleY - Math.floor(((titleLines.length - 1) * titleLineHeight) / 2);

  const title = titleLines
    .map(
      (line, index) =>
        `<text x="${layout.x}" y="${titleStartY + index * titleLineHeight}" text-anchor="${layout.anchor}" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="900" fill="${params.style.overlayTheme.textColor}" stroke="${params.style.overlayTheme.shadowColor}" stroke-width="8" paint-order="stroke fill">${escapeXml(line)}</text>`
    )
    .join('');

  const artist = artistLines
    .map(
      line =>
        `<text x="${layout.x}" y="${layout.artistY}" text-anchor="${layout.anchor}" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="${artistSize}" font-weight="650" fill="${params.style.overlayTheme.textColor}" opacity="0.88">${escapeXml(line)}</text>`
    )
    .join('');

  const plateColor = params.style.overlayTheme.plateColor ?? 'rgba(0,0,0,0.35)';
  const svgTag = 'svg';
  const svg = `<${svgTag} width="${COVER_SIZE}" height="${COVER_SIZE}" viewBox="0 0 ${COVER_SIZE} ${COVER_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="plate" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${plateColor}" stop-opacity="0"/>
        <stop offset="40%" stop-color="${plateColor}" stop-opacity="0.75"/>
        <stop offset="100%" stop-color="${plateColor}" stop-opacity="0.95"/>
      </linearGradient>
    </defs>
    ${layout.plate}
    <g>${title}${artist}</g>
  </${svgTag}>`;

  return Buffer.from(svg);
}

export async function renderAlbumArtCandidate(params: {
  readonly background: Buffer;
  readonly releaseTitle: string;
  readonly artistName: string;
  readonly style: AlbumArtStylePreset;
}): Promise<{ readonly fullRes: Buffer; readonly preview: Buffer }> {
  const base = await sharp(params.background, { failOnError: false })
    .rotate()
    .resize(COVER_SIZE, COVER_SIZE, { fit: 'cover' })
    .toColourspace('srgb')
    .jpeg({ quality: 94 })
    .toBuffer();

  const fullRes = await sharp(base)
    .composite([{ input: buildOverlaySvg(params), blend: 'over' }])
    .jpeg({ quality: 92 })
    .toBuffer();

  const preview = await sharp(fullRes)
    .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: 'cover' })
    .jpeg({ quality: 84 })
    .toBuffer();

  return { fullRes, preview };
}
