/**
 * Shared utilities for share image generation (OG + Story).
 * Used by blog, profile, release, and playlist image routes.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { resolveAppPath } from '@/lib/filesystem-paths';
import { fetchWithTimeoutResponse } from '@/lib/queries/fetch';

export const STORY_SIZE = { width: 1080, height: 1920 } as const;
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Dark theme for share images (matches retargeting ad creative THEME.dark) */
export const THEME = {
  bg: '#000000',
  text: '#F5F5F7',
  textMuted: '#86868B',
  border: '#333336',
  buttonBg: '#FFFFFF',
  buttonText: '#000000',
} as const;

const FONT_DIR = resolveAppPath('public', 'fonts');

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

async function loadFontBuffer(fileName: string): Promise<ArrayBuffer> {
  const fontPath = join(FONT_DIR, fileName);
  const buffer = await fs.readFile(fontPath);
  return toArrayBuffer(buffer);
}

/**
 * Load a Satoshi static font as ArrayBuffer for ImageResponse.
 * Throws on failure so callers never cache images with fallback fonts.
 */
export async function loadSatoshiFont(): Promise<ArrayBuffer> {
  return loadFontBuffer('Satoshi-Bold.ttf');
}

export async function loadDMSansFont(): Promise<ArrayBuffer> {
  return loadFontBuffer('DMSans-Regular.ttf');
}

export async function loadShareFonts(): Promise<{
  readonly satoshi: ArrayBuffer;
}> {
  const satoshi = await loadSatoshiFont();
  return { satoshi };
}

// Satori (next/og) only decodes PNG and JPEG rasters. Ingested avatars are
// mostly AVIF, which made every such profile's OG card 500 (JOV-7753), so any
// other raster format is transcoded to PNG before it reaches ImageResponse.
const SATORI_NATIVE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
]);
const TRANSCODE_MAX_EDGE_PX = 1200;

async function toSatoriImage(
  bytes: Uint8Array,
  contentType: string
): Promise<{ readonly bytes: Uint8Array; readonly contentType: string }> {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (SATORI_NATIVE_IMAGE_TYPES.has(mime)) return { bytes, contentType: mime };

  const { default: sharp } = await import('sharp');
  const png = await sharp(bytes, { failOn: 'none' })
    .resize({
      width: TRANSCODE_MAX_EDGE_PX,
      height: TRANSCODE_MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  return { bytes: new Uint8Array(png), contentType: 'image/png' };
}

/**
 * Convert a remote image URL to a data URL for embedding in ImageResponse.
 * Formats Satori cannot decode (AVIF, WebP, ...) are transcoded to PNG.
 * Returns null on failure (timeout, oversized, non-image, undecodable).
 */
export async function toDataUrl(
  imageUrl: string,
  maxBytes = 2 * 1024 * 1024
): Promise<string | null> {
  try {
    let response: Response | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetchWithTimeoutResponse(imageUrl, {
          headers: { Accept: 'image/*' },
          cache: 'force-cache',
          timeout: 3000,
        });
        break;
      } catch (error) {
        if (attempt === 1) {
          throw error;
        }
      }
    }

    if (!response?.ok) return null;

    const ct = response.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;

    const contentLength = response.headers.get('content-length');
    if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) return null;

    const image = await toSatoriImage(new Uint8Array(arrayBuffer), ct);
    const CHUNK = 8192;
    const chunks: string[] = [];
    for (let i = 0; i < image.bytes.length; i += CHUNK) {
      chunks.push(String.fromCodePoint(...image.bytes.subarray(i, i + CHUNK)));
    }
    return `data:${image.contentType};base64,${btoa(chunks.join(''))}`;
  } catch {
    return null;
  }
}
