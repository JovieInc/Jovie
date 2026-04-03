import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getSharp } from '@/app/api/images/upload/lib/image-processing';
import { fetchWithTimeoutResponse } from '@/lib/queries/fetch';
import { buildAlbumArtLayout } from './layout';
import { parseAlbumArtTitle } from './title-parser';
import type {
  AlbumArtOverlayTone,
  AlbumArtRenderInput,
  AlbumArtRenderResult,
} from './types';

const CANVAS_SIZE = 3000;
const SAFE_MARGIN = 180;
const FONT_FILE_PATHS = [
  path.join(process.cwd(), 'public/fonts/Inter-Variable.woff2'),
  path.join(process.cwd(), 'apps/web/public/fonts/Inter-Variable.woff2'),
] as const;

let fontCssPromise: Promise<string> | null = null;

async function loadFontCss(): Promise<string> {
  let lastError: Error | null = null;

  for (const fontPath of FONT_FILE_PATHS) {
    try {
      const buffer = await readFile(fontPath);
      return `@font-face{font-family:'AlbumArtInter';src:url(data:font/woff2;base64,${buffer.toString('base64')}) format('woff2');font-display:block;}svg{font-family:'AlbumArtInter',sans-serif;}`;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(
    `Failed to load album art font from ${FONT_FILE_PATHS.join(', ')}`,
    {
      cause: lastError,
    }
  );
}

async function getFontCss(): Promise<string> {
  if (!fontCssPromise) {
    fontCssPromise = loadFontCss().catch(error => {
      fontCssPromise = null;
      throw error;
    });
  }

  return fontCssPromise;
}

async function fetchAssetBuffer(url: string): Promise<Buffer> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < 2) {
    try {
      const response = await fetchWithTimeoutResponse(url, { timeout: 10000 });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch asset buffer (${response.status} ${response.statusText})`
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attempt += 1;
    }
  }

  throw lastError ?? new Error('Failed to fetch asset buffer');
}

function buildSvg(params: {
  readonly title: string;
  readonly artistName: string;
  readonly versionLabel: string | null;
  readonly tone: AlbumArtOverlayTone;
  readonly fontCss: string;
  readonly logoPosition: AlbumArtRenderInput['logoPosition'];
  readonly logoOpacity: number;
  readonly logoDataUri?: string;
}) {
  const parsedTitle = parseAlbumArtTitle(params.title);
  const layout = buildAlbumArtLayout({
    parsedTitle,
    logoPosition: params.logoPosition ?? null,
  });
  const titleColor = params.tone === 'dark' ? '#0f172a' : '#f8fafc';
  const badgeFill = params.tone === 'dark' ? '#e2e8f0' : 'rgba(15,23,42,0.56)';
  const artistY = SAFE_MARGIN + layout.artistFontSize;
  const titleStartY =
    CANVAS_SIZE - SAFE_MARGIN - layout.titleFontSize * layout.titleLines.length;

  const logo =
    params.logoDataUri && layout.logoPosition
      ? (() => {
          const x = layout.logoPosition.endsWith('right')
            ? CANVAS_SIZE - SAFE_MARGIN - layout.logoSize
            : SAFE_MARGIN;
          const y = layout.logoPosition.startsWith('bottom')
            ? CANVAS_SIZE - SAFE_MARGIN - layout.logoSize
            : SAFE_MARGIN;

          return `<image href="${params.logoDataUri}" x="${x}" y="${y}" width="${layout.logoSize}" height="${layout.logoSize}" opacity="${params.logoOpacity}" preserveAspectRatio="xMidYMid meet" />`;
        })()
      : '';

  const versionBadge =
    params.versionLabel && layout.versionFontSize > 0
      ? `<g transform="translate(${CANVAS_SIZE - SAFE_MARGIN - 620}, ${SAFE_MARGIN})"><rect rx="34" ry="34" width="620" height="124" fill="${badgeFill}" /><text x="310" y="80" font-size="${layout.versionFontSize}" font-weight="650" text-anchor="middle" fill="${titleColor}">${escapeXml(params.versionLabel)}</text></g>`
      : '';

  const titleTexts = layout.titleLines
    .map((line, index) => {
      const y = titleStartY + index * (layout.titleFontSize + 28);
      return `<text x="${SAFE_MARGIN}" y="${y}" font-size="${layout.titleFontSize}" font-weight="780" fill="${titleColor}">${escapeXml(line)}</text>`;
    })
    .join('');

  const artistShadow =
    params.tone === 'light'
      ? `<rect x="0" y="${CANVAS_SIZE - 820}" width="${CANVAS_SIZE}" height="820" fill="url(#bottomFade)" />`
      : `<rect x="0" y="${CANVAS_SIZE - 760}" width="${CANVAS_SIZE}" height="760" fill="rgba(255,255,255,0.26)" />`;

  return Buffer.from(
    `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg"><style>${params.fontCss}</style><defs><linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(15,23,42,0)"/><stop offset="100%" stop-color="rgba(15,23,42,0.82)"/></linearGradient></defs>${artistShadow}${logo}${versionBadge}<text x="${SAFE_MARGIN}" y="${artistY}" font-size="${layout.artistFontSize}" font-weight="580" fill="${titleColor}" opacity="0.94">${escapeXml(params.artistName)}</text>${titleTexts}</svg>`
  );
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function detectLogoMimeSubtype(logoBuffer: Buffer): 'png' | 'svg+xml' {
  const isPng =
    logoBuffer[0] === 0x89 && logoBuffer.subarray(1, 4).toString() === 'PNG';

  return isPng ? 'png' : 'svg+xml';
}

export async function renderAlbumArt(
  input: AlbumArtRenderInput
): Promise<AlbumArtRenderResult> {
  const sharp = await getSharp();
  const fontCss = await getFontCss();
  const overlayTone = input.overlayTone ?? 'light';
  const logoBuffer =
    input.logoBuffer && input.logoBuffer.length > 0 ? input.logoBuffer : null;
  const logoDataUri = logoBuffer
    ? `data:image/${detectLogoMimeSubtype(logoBuffer)};base64,${logoBuffer.toString('base64')}`
    : undefined;

  const background = sharp(input.backgroundBuffer, { failOnError: false })
    .resize(CANVAS_SIZE, CANVAS_SIZE, {
      fit: 'cover',
      position: 'centre',
    })
    .rotate()
    .withMetadata({ orientation: undefined });

  const svg = buildSvg({
    title: input.title,
    artistName: input.artistName,
    versionLabel: input.versionLabel,
    tone: overlayTone,
    fontCss,
    logoPosition: input.logoPosition,
    logoOpacity: input.logoOpacity ?? 1,
    logoDataUri,
  });

  const finalBuffer = await background
    .composite([{ input: svg }])
    .png()
    .toBuffer();

  return {
    buffer: finalBuffer,
    overlayTone,
  };
}

export async function fetchLogoBuffer(
  url: string | null
): Promise<Buffer | null> {
  if (!url) {
    return null;
  }

  return fetchAssetBuffer(url);
}
