/**
 * POST /api/youtube-thumbnails/preview — paste a channel, get three
 * before/after thumbnails (JOV-5862).
 *
 * Anonymous. No OAuth. Server-counted "3 free" on IP+device AND per channel.
 * Generation is flag-gated (`YOUTUBE_THUMBNAILS_PASTE_GENERATE`, default off)
 * so this route can ship and be dogfooded with zero model spend.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS, RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import { getClientIP } from '@/lib/rate-limit';
import { extractAsnFromRequest } from '@/lib/utils/bot-detection';
import { logger } from '@/lib/utils/logger';
import { YouTubeDataApiUnavailableError } from '@/lib/youtube/resolve-channel';
import { PreviewAbuseError } from '@/lib/youtube-thumbnails/abuse';
import {
  buildThumbnailPreview,
  InvalidChannelError,
} from '@/lib/youtube-thumbnails/preview-service';

export const runtime = 'nodejs';

const DEVICE_HEADER = 'x-jovie-device';
const DEVICE_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

const previewRequestSchema = z.object({
  channel: z.string().trim().min(1).max(200),
});

function readDeviceId(request: Request): string | null {
  const raw = request.headers.get(DEVICE_HEADER)?.trim();
  return raw && DEVICE_ID_PATTERN.test(raw) ? raw : null;
}

function errorResponse(
  status: number,
  code: string,
  error: string,
  extraHeaders: Record<string, string> = {}
) {
  return NextResponse.json(
    { ok: false, code, error },
    { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } }
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'invalid_channel', 'Invalid request body');
  }

  const parsed = previewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      'invalid_channel',
      'Paste a channel handle or link'
    );
  }

  const ip = getClientIP(request);
  const asn = extractAsnFromRequest(request);
  const deviceId = readDeviceId(request);

  try {
    const result = await buildThumbnailPreview({
      channelInput: parsed.data.channel,
      ip,
      deviceId,
      asn,
    });
    return NextResponse.json(
      { ok: true, ...result },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof InvalidChannelError) {
      return errorResponse(
        400,
        error.code,
        error.code === 'no_videos'
          ? 'That channel has no public videos yet'
          : 'We could not find that channel'
      );
    }
    if (error instanceof PreviewAbuseError) {
      const retryHeaders =
        error.retryAfterSeconds !== null
          ? { 'Retry-After': String(error.retryAfterSeconds) }
          : {};
      if (error.code === 'datacenter') {
        return errorResponse(403, error.code, 'Blocked network');
      }
      return errorResponse(
        429,
        error.code,
        'Free preview limit reached',
        retryHeaders
      );
    }
    if (error instanceof YouTubeDataApiUnavailableError) {
      logger.warn('[youtube-thumbnails] Data API not configured');
      return errorResponse(
        503,
        error.code,
        'YouTube lookups are unavailable right now',
        { 'Retry-After': RETRY_AFTER_SERVICE }
      );
    }

    await captureError('[youtube-thumbnails] preview failed', error, {
      route: '/api/youtube-thumbnails/preview',
    });
    return errorResponse(500, 'internal_error', 'Something went wrong');
  }
}
