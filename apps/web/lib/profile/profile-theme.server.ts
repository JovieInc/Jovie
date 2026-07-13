import 'server-only';

import { captureWarning } from '@/lib/error-tracking';
import { downloadImage } from '@/lib/ingestion/avatar/http-client';
import { executeWithRetry, withTimeout } from '@/lib/resilience/primitives';
import { logger } from '@/lib/utils/logger';
import {
  mergeProfileTheme,
  normalizeHexColor,
  type ProfileAccentTheme,
  type ProfileThemeRecord,
  readProfileAccentTheme,
} from './profile-theme';

const PROFILE_ACCENT_DOWNLOAD_TIMEOUT_MS = 10_000;
const PROFILE_ACCENT_RETRY_POLICY = {
  maxRetries: 1,
  baseDelayMs: 200,
  maxDelayMs: 700,
  jitterRatio: 0.2,
} as const;

function isRetryableAccentError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (
    message.includes('invalid image host') ||
    message.includes('invalid redirect host') ||
    message.includes('unsupported image content type') ||
    message.includes('invalid image bytes')
  ) {
    return false;
  }

  return true;
}

function rgbToHex(r: number, g: number, b: number): string {
  const normalize = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, '0');

  return `#${normalize(r)}${normalize(g)}${normalize(b)}`;
}

function normalizeAccentSourceUrl(
  sourceUrl: string | null | undefined
): string | null {
  if (typeof sourceUrl !== 'string') {
    return null;
  }

  const trimmed = sourceUrl.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const hasExplicitProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed);
  if (!hasExplicitProtocol) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.pathname === '/_next/image') {
      return normalizeAccentSourceUrl(parsed.searchParams.get('url'));
    }

    if (parsed.protocol !== 'https:') {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname.length === 0 ||
      hostname === '_next' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1'
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

async function getSharp() {
  const sharpModule = await import('sharp');
  return 'default' in sharpModule ? sharpModule.default : sharpModule;
}

export async function deriveProfileAccentThemeFromBuffer(params: {
  buffer: Buffer;
  sourceUrl: string;
}): Promise<ProfileAccentTheme | null> {
  const sharp = await getSharp();
  const stats = await withTimeout(
    sharp(params.buffer, { failOnError: false })
      .rotate()
      .withMetadata({ orientation: undefined })
      .resize({ width: 72, height: 72, fit: 'cover', position: 'centre' })
      .toColourspace('srgb')
      .stats(),
    {
      timeoutMs: PROFILE_ACCENT_DOWNLOAD_TIMEOUT_MS,
      context: 'Profile accent extraction',
    }
  );

  const dominant = stats.dominant;
  const primaryHex =
    dominant &&
    typeof dominant.r === 'number' &&
    typeof dominant.g === 'number' &&
    typeof dominant.b === 'number'
      ? normalizeHexColor(rgbToHex(dominant.r, dominant.g, dominant.b))
      : null;

  if (!primaryHex) {
    return null;
  }

  return {
    version: 1,
    primaryHex,
    sourceUrl: params.sourceUrl,
    generatedAt: new Date().toISOString(),
  };
}

export async function deriveProfileAccentThemeFromUrl(
  sourceUrl: string
): Promise<ProfileAccentTheme | null> {
  const normalizedSourceUrl = normalizeAccentSourceUrl(sourceUrl);
  if (!normalizedSourceUrl) {
    return null;
  }

  try {
    const downloaded = await executeWithRetry(
      async () =>
        withTimeout(downloadImage(normalizedSourceUrl), {
          timeoutMs: PROFILE_ACCENT_DOWNLOAD_TIMEOUT_MS,
          context: 'Profile accent download',
        }),
      {
        ...PROFILE_ACCENT_RETRY_POLICY,
        isRetryable: isRetryableAccentError,
      }
    );

    return deriveProfileAccentThemeFromBuffer({
      buffer: downloaded.buffer,
      sourceUrl: normalizedSourceUrl,
    });
  } catch (error) {
    await captureWarning('Profile accent derivation failed', error, {
      sourceUrl: normalizedSourceUrl,
    });
    logger.warn('Profile accent derivation failed', {
      sourceUrl: normalizedSourceUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function buildThemeWithProfileAccent(params: {
  existingTheme: Record<string, unknown> | null | undefined;
  sourceUrl: string | null | undefined;
  sourceBuffer?: Buffer | null;
}): Promise<ProfileThemeRecord> {
  const sourceUrl =
    typeof params.sourceUrl === 'string' && params.sourceUrl.trim().length > 0
      ? params.sourceUrl.trim()
      : null;

  if (!sourceUrl) {
    return mergeProfileTheme(params.existingTheme, {});
  }

  try {
    const profileAccent =
      params.sourceBuffer && params.sourceBuffer.length > 0
        ? await deriveProfileAccentThemeFromBuffer({
            buffer: params.sourceBuffer,
            sourceUrl,
          })
        : await deriveProfileAccentThemeFromUrl(sourceUrl);

    return mergeProfileTheme(params.existingTheme, {
      profileAccent: profileAccent ?? undefined,
    });
  } catch (error) {
    await captureWarning('Profile accent build failed', error, {
      sourceUrl,
    });
    logger.warn('Profile accent build failed', {
      sourceUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return mergeProfileTheme(params.existingTheme, {});
  }
}

export async function ensureThemeHasProfileAccent(params: {
  existingTheme: Record<string, unknown> | null | undefined;
  sourceUrl: string | null | undefined;
  sourceBuffer?: Buffer | null;
}): Promise<ProfileThemeRecord> {
  const existingAccent = readProfileAccentTheme(params.existingTheme);

  if (existingAccent) {
    return mergeProfileTheme(params.existingTheme, {});
  }

  return buildThemeWithProfileAccent(params);
}
