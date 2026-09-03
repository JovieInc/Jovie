import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  YOUTUBE_THUMBNAILS_EVENTS,
  YOUTUBE_THUMBNAILS_OPTIMIZATION,
} from '@/data/youtubeThumbnailsCopy';
import { trackEvent } from '@/lib/analytics/runtime-aware';
import { captureError } from '@/lib/error-tracking';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
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
  assertGenerationCooldown,
  assertRequestAdmitted,
  buildThumbnailVisitorKey,
  consumeGenerationAllowance,
  PreviewAbuseError,
  parseThumbnailDeviceId,
} from '@/lib/youtube-thumbnails/abuse';
import {
  generateThumbnailRedo,
  getCachedThumbnailRedo,
} from '@/lib/youtube-thumbnails/generate';

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

interface PreviewItem {
  readonly videoId: string;
  readonly title: string;
  readonly beforeUrl: string;
  afterUrl: string | null;
}

/**
 * Fill `afterUrl`s for the preview items, cache-first. A cached redo costs
 * nothing; an uncached one must clear the per-request cooldown and then both
 * server-counted caps (visitor, channel — first cap wins) before any model
 * call. A denied cap or a failed generation degrades that item to
 * before-only; it never fails the whole preview.
 */
async function fillThumbnailRedos(
  items: PreviewItem[],
  context: { readonly visitorKey: string; readonly channelId: string }
): Promise<{ generated: number; remaining: number | null }> {
  const pending: number[] = [];
  for (const [index, item] of items.entries()) {
    const cached = await getCachedThumbnailRedo(item.videoId);
    if (cached) {
      item.afterUrl = cached;
    } else {
      pending.push(index);
    }
  }

  let generated = 0;
  let remaining: number | null = null;
  if (pending.length === 0) return { generated, remaining };

  try {
    await assertGenerationCooldown({ visitorKey: context.visitorKey });
  } catch (error) {
    if (error instanceof PreviewAbuseError && error.code === 'cooldown') {
      return { generated, remaining };
    }
    throw error;
  }

  for (const index of pending) {
    try {
      const allowance = await consumeGenerationAllowance({
        visitorKey: context.visitorKey,
        channelId: context.channelId,
      });
      remaining = allowance.remaining;
    } catch (error) {
      if (
        error instanceof PreviewAbuseError &&
        (error.code === 'visitor_cap' || error.code === 'channel_cap')
      ) {
        break;
      }
      throw error;
    }
    const redo = await generateThumbnailRedo({
      videoId: items[index].videoId,
      beforeUrl: items[index].beforeUrl,
    });
    if (redo.ok) {
      items[index].afterUrl = redo.afterUrl;
      generated += 1;
    }
  }
  return { generated, remaining };
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

    const items: PreviewItem[] = videos.map(video => ({
      videoId: video.videoId,
      title: video.title,
      beforeUrl: video.thumbnailUrl,
      afterUrl: null,
    }));

    let mode: 'preview_only' | 'before_after' = 'preview_only';
    let remaining: number | null = null;
    let generated = 0;
    if (isCodeFlagEnabled('YOUTUBE_THUMBNAILS_PASTE_GENERATE')) {
      mode = 'before_after';
      const visitorKey = buildThumbnailVisitorKey(
        ip,
        parseThumbnailDeviceId(request.headers.get('x-jovie-device'))
      );
      const outcome = await fillThumbnailRedos(items, {
        visitorKey,
        channelId: channel.channelId,
      });
      generated = outcome.generated;
      remaining = outcome.remaining;
    }

    const result = {
      channel: {
        id: channel.channelId,
        title: channel.title,
        handle: channel.handle,
      },
      mode,
      remaining,
      items,
    };
    void trackEvent(YOUTUBE_THUMBNAILS_EVENTS.PREVIEWED, {
      variantIdentity: YOUTUBE_THUMBNAILS_OPTIMIZATION.variantIdentity,
      mode: result.mode,
      itemCount: result.items.length,
      generatedCount: generated,
      cachedCount: result.items.filter(item => item.afterUrl !== null).length,
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
