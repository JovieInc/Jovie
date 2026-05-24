import 'server-only';

import { put } from '@vercel/blob';
import sharp from 'sharp';
import { uploadBufferToBlob } from '@/app/api/images/upload/lib/blob-upload';
import { PROCESSING_TIMEOUT_MS } from '@/app/api/images/upload/lib/constants';
import { env } from '@/lib/env-server';
import { withTimeout } from '@/lib/resilience/primitives';
import { logger } from '@/lib/utils/logger';
import type { MerchDesignLane } from './types';

const PRINT_WIDTH = 4500;
const PRINT_HEIGHT = 5400;
const MOCKUP_WIDTH = 1800;
const MOCKUP_HEIGHT = 2200;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function fallbackBlobUrl(path: string): string {
  return `https://blob.vercel-storage.com/${path}`;
}

async function uploadPublicBuffer(params: {
  readonly path: string;
  readonly buffer: Buffer;
  readonly contentType: string;
}): Promise<string> {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    if (env.NODE_ENV === 'production') {
      throw new TypeError('Blob storage not configured');
    }
    logger.warn('[merch] Blob token missing; returning development URL', {
      path: params.path,
    });
    return fallbackBlobUrl(params.path);
  }

  const blobUrl = await withTimeout(
    uploadBufferToBlob(put, params.path, params.buffer, params.contentType),
    {
      timeoutMs: PROCESSING_TIMEOUT_MS,
      context: 'Blob upload',
    }
  );

  if (!blobUrl.startsWith('https://')) {
    throw new TypeError('Invalid blob URL returned from storage');
  }

  return blobUrl;
}

function splitWords(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function wrapWords(value: string, maxLines: number): string[] {
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

function laneCopy(lane: MerchDesignLane): {
  readonly eyebrow: string;
  readonly footer: string;
  readonly density: 'minimal' | 'medium' | 'maximal';
} {
  switch (lane) {
    case 'band_tour_uniform':
      return {
        eyebrow: 'LIVE SIGNAL',
        footer: 'JOVIE MERCH SERIES',
        density: 'maximal',
      };
    case 'fashion_graphic_item':
      return {
        eyebrow: 'LIMITED OBJECT',
        footer: 'WEAR THE SOUND',
        density: 'minimal',
      };
    case 'artist_world_artifact':
      return {
        eyebrow: 'ARTIST WORLD',
        footer: 'ARCHIVE PIECE',
        density: 'medium',
      };
  }
}

function buildPrintSvg(params: {
  readonly artistName: string;
  readonly designName: string;
  readonly lane: MerchDesignLane;
  readonly concept: string;
}): Buffer {
  const lane = laneCopy(params.lane);
  const artistLines = wrapWords(params.artistName.toUpperCase(), 3);
  const designLines = wrapWords(params.designName.toUpperCase(), 2);
  const artistStartY = 1900 - (artistLines.length - 1) * 250;
  const designStartY = 3000 - (designLines.length - 1) * 150;
  const motif =
    lane.density === 'minimal'
      ? '<rect x="720" y="980" width="3060" height="3060" rx="30" fill="none" stroke="#f3f3f0" stroke-width="42"/>'
      : '<path d="M640 1080 H3860 M640 3900 H3860 M980 720 V4660 M3520 720 V4660" stroke="#f3f3f0" stroke-width="34" opacity=".72"/>';

  const artistText = artistLines
    .map(
      (line, index) =>
        `<text x="2250" y="${artistStartY + index * 420}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="420" font-weight="900" letter-spacing="0" fill="#f3f3f0">${escapeXml(line)}</text>`
    )
    .join('');
  const designText = designLines
    .map(
      (line, index) =>
        `<text x="2250" y="${designStartY + index * 220}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="190" font-weight="700" letter-spacing="0" fill="#f3f3f0" opacity=".92">${escapeXml(line)}</text>`
    )
    .join('');

  // eslint-disable-next-line @jovie/icon-usage -- SVG string for Sharp image processing, not a React component
  const svg = `<svg width="${PRINT_WIDTH}" height="${PRINT_HEIGHT}" viewBox="0 0 ${PRINT_WIDTH} ${PRINT_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${PRINT_WIDTH}" height="${PRINT_HEIGHT}" fill="none"/>
    <g>
      ${motif}
      <text x="2250" y="650" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="140" font-weight="800" letter-spacing="0" fill="#f3f3f0" opacity=".82">${escapeXml(lane.eyebrow)}</text>
      ${artistText}
      ${designText}
      <text x="2250" y="4640" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="128" font-weight="700" letter-spacing="0" fill="#f3f3f0" opacity=".8">${escapeXml(lane.footer)}</text>
    </g>
  </svg>`;

  return Buffer.from(svg);
}

async function renderMockup(printFile: Buffer): Promise<Buffer> {
  const shirtSvg =
    Buffer.from(`<svg width="${MOCKUP_WIDTH}" height="${MOCKUP_HEIGHT}" viewBox="0 0 ${MOCKUP_WIDTH} ${MOCKUP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${MOCKUP_WIDTH}" height="${MOCKUP_HEIGHT}" fill="#f4f2ed"/>
    <path d="M560 260 L720 420 H1080 L1240 260 L1560 420 L1390 760 L1260 690 V1880 H540 V690 L410 760 L240 420 Z" fill="#111" stroke="#050505" stroke-width="8"/>
    <path d="M720 420 C780 560 1020 560 1080 420" fill="none" stroke="#242424" stroke-width="16"/>
  </svg>`);

  const resizedPrint = await sharp(printFile)
    .resize(760, 920, { fit: 'inside' })
    .png()
    .toBuffer();

  return sharp(shirtSvg)
    .composite([{ input: resizedPrint, top: 720, left: 520 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

export async function createMerchArtwork(params: {
  readonly profileId: string;
  readonly generationId: string;
  readonly optionId: string;
  readonly artistName: string;
  readonly designName: string;
  readonly lane: MerchDesignLane;
  readonly concept: string;
}): Promise<{ readonly printFileUrl: string; readonly mockupUrl: string }> {
  const printFile = await sharp(buildPrintSvg(params)).png().toBuffer();
  const mockup = await renderMockup(printFile);
  const basePath = `merch/generated/${params.profileId}/${params.generationId}/${params.optionId}`;
  const [printFileUrl, mockupUrl] = await Promise.all([
    uploadPublicBuffer({
      path: `${basePath}-print.png`,
      buffer: printFile,
      contentType: 'image/png',
    }),
    uploadPublicBuffer({
      path: `${basePath}-mockup.jpg`,
      buffer: mockup,
      contentType: 'image/jpeg',
    }),
  ]);

  return { printFileUrl, mockupUrl };
}
