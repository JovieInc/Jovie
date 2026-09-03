import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  YOUTUBE_THUMBNAILS_EVENTS,
  YOUTUBE_THUMBNAILS_OPTIMIZATION,
} from '@/data/youtubeThumbnailsCopy';
import { trackEvent } from '@/lib/analytics/runtime-aware';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS, RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import { getClientIP } from '@/lib/rate-limit';
import { extractAsnFromRequest } from '@/lib/utils/bot-detection';
import { logger } from '@/lib/utils/logger';
import {
  listRecentPublicVideos,
  parseYouTubeChannelInput,
  resolveYouTubeChannel,
  YouTubeDataApiUnavailableError,
} from '@/lib/youtube/resolve-channel';
import {
  assertChannelSpread,
  assertRequestAdmitted,
  PreviewAbuseError,
} from '@/lib/youtube-thumbnails/abuse';

export const runtime = 'nodejs';

const previewRequestSchema = z.object({
  channel: z.string().trim().min(1).max(200),
});

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

  try {
    await assertRequestAdmitted({ ip, asn });
    const ref = parseYouTubeChannelInput(parsed.data.channel);
    const channel = ref ? await resolveYouTubeChannel(ref) : null;
    if (!channel) {
      return errorResponse(
        400,
        'invalid_channel',
        'We could not find that channel'
      );
    }
    await assertChannelSpread({ ip, channelId: channel.channelId });
    const videos = await listRecentPublicVideos(channel.uploadsPlaylistId, 3);
    if (videos.length === 0) {
      return errorResponse(
        400,
        'no_videos',
        'That channel has no public videos yet'
      );
    }

    const result = {
      channel: {
        id: channel.channelId,
        title: channel.title,
        handle: channel.handle,
      },
      mode: 'preview_only' as const,
      remaining: null,
      items: videos.map(video => ({
        videoId: video.videoId,
        title: video.title,
        beforeUrl: video.thumbnailUrl,
        afterUrl: null,
      })),
    };
    void trackEvent(YOUTUBE_THUMBNAILS_EVENTS.PREVIEWED, {
      variantIdentity: YOUTUBE_THUMBNAILS_OPTIMIZATION.variantIdentity,
      mode: result.mode,
      itemCount: result.items.length,
    });
    return NextResponse.json(
      { ok: true, ...result },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof PreviewAbuseError) {
      const retryHeaders: Record<string, string> =
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
